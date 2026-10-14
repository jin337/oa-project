package service

import (
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strings"

	"gorm.io/gorm"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/model"
	"back-end/internal/pkg/logger"
)

// 附件（/uploads 下的本机文件）生命周期管理。
//
// 现状：上传接口只负责把文件落盘、把地址写进业务数据的文本/JSON 列，没有附件表、也没有引用计数。
// 因此「某个附件还有没有人引用」只能反查业务数据本身，口径如下：
//   - 候选地址来自**本次被删除的那些行**里的 /uploads/... 片段（主表 + 子表都要看）；
//   - 判定引用时只统计**未删除**（deleted_at IS NULL）的行 —— 软删的行仍保留着地址字符串，
//     若把它们也算作引用，文件永远回收不掉（清空草稿箱一个文件都不减，等于功能失效）；
//   - 只要还有任意一张业务表（页面配置的主表或子表）的任意文本列里出现该文件名，
//     即视为仍被引用，保留文件；
//   - 只处理本机上传地址，外部 URL（http://、OSS 等）一律不动。
//
// 文件删除无法回滚，因此回收必须在业务事务**提交之后**执行；单个文件出错只记日志，不阻断主流程。

// uploadURLPrefix 上传接口回写业务数据的地址前缀（静态路由 /uploads 与 config.UploadDir 同源）
const uploadURLPrefix = "/uploads/"

// uploadPathPattern 匹配业务数据里出现的本机附件地址，如 /uploads/app_xxx/20261014150620_54700.png
var uploadPathPattern = regexp.MustCompile(`/uploads/[A-Za-z0-9_\-]+/[A-Za-z0-9_\-]+\.[A-Za-z0-9]+`)

// uploadTextColumnTypes 可能存放附件地址的列类型；数值/日期等列不参与扫描
var uploadTextColumnTypes = map[string]bool{
	"varchar": true, "char": true, "text": true,
	"tinytext": true, "mediumtext": true, "longtext": true, "json": true,
}

// collectUploadPaths 从若干业务行里收集本机附件地址（去重并保持出现顺序）。
// 递归遍历 map / 数组 / 字符串，因此地址无论是独立列还是嵌在 JSON 数组里都能取到。
func collectUploadPaths(rows []map[string]interface{}) []string {
	seen := make(map[string]bool)
	paths := make([]string, 0, 2)
	var walk func(v interface{})
	walk = func(v interface{}) {
		switch t := v.(type) {
		case string:
			for _, m := range uploadPathPattern.FindAllString(t, -1) {
				if !seen[m] {
					seen[m] = true
					paths = append(paths, m)
				}
			}
		case []byte:
			walk(string(t))
		case map[string]interface{}:
			for _, sub := range t {
				walk(sub)
			}
		case []interface{}:
			for _, sub := range t {
				walk(sub)
			}
		case []map[string]interface{}:
			for _, sub := range t {
				walk(sub)
			}
		}
	}
	for _, row := range rows {
		for _, v := range row {
			walk(v)
		}
	}
	return paths
}

// collectUploadPathsOf 读取指定表的匹配行并收集其中的本机附件地址。
// 读取失败只记日志并返回空：附件回收是删除流程的附加动作，不能反过来阻断删除。
func collectUploadPathsOf(db *gorm.DB, table, where string, args ...interface{}) []string {
	var rows []map[string]interface{}
	if err := db.Raw("SELECT * FROM `"+table+"` WHERE "+where, args...).Scan(&rows).Error; err != nil {
		logger.Errorf("[附件] 读取待删除数据失败 table=%s: %v", table, err)
		return nil
	}
	return collectUploadPaths(rows)
}

// dedupeUploadPaths 去重（主表与子表可能引用同一份附件）
func dedupeUploadPaths(paths []string) []string {
	if len(paths) < 2 {
		return paths
	}
	seen := make(map[string]bool, len(paths))
	out := make([]string, 0, len(paths))
	for _, p := range paths {
		if !seen[p] {
			seen[p] = true
			out = append(out, p)
		}
	}
	return out
}

// ReclaimOrphanUploads 回收已无人引用的附件文件，返回真正删掉的地址。
// 必须在业务事务提交之后调用（文件删除不可回滚）；单个文件失败只记日志并继续。
func ReclaimOrphanUploads(paths []string) []string {
	if len(paths) == 0 {
		return nil
	}
	removed := make([]string, 0, len(paths))
	for _, p := range paths {
		referenced, err := uploadStillReferenced(p)
		if err != nil {
			// 查不清引用情况时保守处理：保留文件，下次删单还有机会回收
			logger.Errorf("[附件] 引用检查失败，保留文件 %s: %v", p, err)
			continue
		}
		if referenced {
			continue
		}
		abs, err := resolveUploadPath(p)
		if err != nil {
			logger.Errorf("[附件] 地址非法，跳过 %s: %v", p, err)
			continue
		}
		if err := os.Remove(abs); err != nil {
			if !os.IsNotExist(err) {
				logger.Errorf("[附件] 删除文件失败 %s: %v", abs, err)
			}
			continue
		}
		removed = append(removed, p)
	}
	if len(removed) > 0 {
		logger.Infof("[附件] 已回收无人引用的附件 %d 个: %s", len(removed), strings.Join(removed, ", "))
	}
	return removed
}

// uploadStillReferenced 扫描全部业务表（页面配置的主表 + 子表），判断该附件是否仍被未删除的行引用。
// 用文件名做 LIKE 匹配：上传文件名带时间戳+纳秒后缀，天然唯一，可避免整条地址在 JSON 里的转义差异。
func uploadStillReferenced(path string) (bool, error) {
	idx := strings.LastIndex(path, "/")
	if idx < 0 || idx == len(path)-1 {
		return true, errors.New("无法解析附件文件名")
	}
	like := "%" + path[idx+1:] + "%"

	var apps []model.Application
	if err := database.DB.Select("table_name, sub_table_name").Find(&apps).Error; err != nil {
		return true, err
	}
	for _, app := range apps {
		tables := make([]string, 0, 4)
		if app.TableName != "" {
			tables = append(tables, app.TableName)
		}
		tables = append(tables, splitSubTables(app.SubTableName)...)
		for _, t := range tables {
			if !isValidTableName(t) {
				continue
			}
			hit, err := tableReferencesUpload(bizTableName(t), like)
			if err != nil {
				return true, err
			}
			if hit {
				return true, nil
			}
		}
	}
	return false, nil
}

// tableReferencesUpload 单表检查：任意文本列命中该附件名、且该行未被删除，即视为仍被引用
func tableReferencesUpload(table, like string) (bool, error) {
	cols, err := queryColumns(table)
	if err != nil {
		return false, err
	}
	conds := make([]string, 0, len(cols))
	args := make([]interface{}, 0, len(cols))
	hasDeletedAt := false
	for _, c := range cols {
		if c.Name == "deleted_at" {
			hasDeletedAt = true
		}
		if !uploadTextColumnTypes[strings.ToLower(c.Type)] {
			continue
		}
		conds = append(conds, "`"+c.Name+"` LIKE ?")
		args = append(args, like)
	}
	if len(conds) == 0 {
		return false, nil
	}
	sql := "SELECT COUNT(*) FROM `" + table + "` WHERE (" + strings.Join(conds, " OR ") + ")"
	if hasDeletedAt {
		sql += " AND `deleted_at` IS NULL"
	}
	var cnt int64
	if err := database.DB.Raw(sql, args...).Scan(&cnt).Error; err != nil {
		return false, err
	}
	return cnt > 0, nil
}

// resolveUploadPath 把 /uploads/xx/yy.png 解析为磁盘路径，并确保结果仍在上传根目录内（防目录穿越）。
// 地址来自业务数据，属于不可信输入，因此除了正则限制字符外再做一次前缀校验。
func resolveUploadPath(p string) (string, error) {
	if !strings.HasPrefix(p, uploadURLPrefix) {
		return "", errors.New("非本机附件地址")
	}
	rel := strings.TrimPrefix(p, uploadURLPrefix)
	if rel == "" {
		return "", errors.New("附件地址为空")
	}
	root, err := filepath.Abs(config.UploadDir)
	if err != nil {
		return "", err
	}
	abs := filepath.Join(root, filepath.FromSlash(rel))
	if !strings.HasPrefix(abs, root+string(os.PathSeparator)) {
		return "", errors.New("附件路径越界")
	}
	return abs, nil
}
