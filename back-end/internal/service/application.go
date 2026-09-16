package service

import (
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"back-end/internal/config"
	"back-end/internal/database"
	"back-end/internal/model"
)

// bizTablePrefix 读取配置表前缀并规范化（确保以 _ 结尾，与系统表 oa_ 风格一致）
func bizTablePrefix() string {
	p := strings.TrimRight(config.Cfg.MySQL.TablePrefix, "_")
	if p == "" {
		return ""
	}
	return p + "_"
}

// bizTableName 给业务表名附加配置前缀
func bizTableName(raw string) string {
	return bizTablePrefix() + raw
}

// ApplicationList 页面配置分页列表：keyword 模糊匹配 name 或 code
func ApplicationList(req *model.ApplicationListReq) ([]model.Application, int64, error) {
	db := database.DB.Model(&model.Application{})
	if req.Keyword != "" {
		kw := "%" + req.Keyword + "%"
		db = db.Where("name LIKE ? OR code LIKE ?", kw, kw)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.Application
	err := db.Order("id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// ApplicationDetail 页面配置详情
func ApplicationDetail(id uint) (*model.Application, error) {
	var app model.Application
	if err := database.DB.First(&app, id).Error; err != nil {
		return nil, errors.New("页面配置不存在")
	}
	return &app, nil
}

// visibilityFlag 判断 FormElement.Visibility 中指定开关是否为真（list/search），兼容 JSON 反序列化后的数字类型
func visibilityFlag(vis map[string]interface{}, key string) bool {
	if vis == nil {
		return false
	}
	switch v := vis[key].(type) {
	case float64:
		return int(v) == 1
	case int:
		return v == 1
	case bool:
		return v
	}
	return false
}

// ApplicationByCode 根据页面编码（code）查询页面配置，并按 state 裁剪返回：
//   - list  ：基础信息 + 搜索项 search_fields + 表格表头 columns + 主表数据列表（分页），布局 JSON 置空
//   - form  ：基础信息 + form_layout_json，detail_layout_json 置空
//   - detail：基础信息 + detail_layout_json，form_layout_json 置空
//   - 空/未知：返回完整配置（兼容旧调用方）
//
// filters 为动态搜索字段（field_key → 值），仅 state=list 时作用于数据列表过滤
func ApplicationByCode(code, state string, page, size int, filters map[string]string) (*model.ApplicationByCodeResult, error) {
	var app model.Application
	if err := database.DB.Where("code = ?", code).First(&app).Error; err != nil {
		return nil, errors.New("页面配置不存在")
	}
	result := &model.ApplicationByCodeResult{Application: app}

	switch state {
	case "list":
		// 列表场景不需要布局配置，置空减少冗余
		result.FormLayoutJSON = nil
		result.DetailLayoutJSON = nil
		result.ApprovalFlowJSON = nil
		// 搜索项与表格表头取自该应用的表单元素（visibility.search / visibility.list）
		var elements []model.FormElement
		if err := database.DB.Where("app_id = ?", app.ID).Order("id ASC").Find(&elements).Error; err != nil {
			return nil, err
		}
		for _, el := range elements {
			if visibilityFlag(el.Visibility, "search") {
				result.SearchFields = append(result.SearchFields, el)
			}
			if visibilityFlag(el.Visibility, "list") {
				result.Columns = append(result.Columns, el)
			}
		}
		// 主表数据列表（复用动态数据查询逻辑，filters 作为动态过滤条件，过滤软删除；排除草稿——list 态为已提交数据视图）
		list, total, err := ApplicationDataList(app.ID, &model.ApplicationDataListReq{
			BaseListReq:  model.BaseListReq{Page: page, Size: size},
			TableName:    app.TableName,
			ExcludeDraft: true,
			Filters:      filters,
		})
		if err != nil {
			return nil, err
		}
		result.List = list
		result.Total = total
		result.Page, result.Size = page, size
		if result.Page <= 0 {
			result.Page = 1
		}
		if result.Size <= 0 || result.Size > 10000 {
			result.Size = 10
		}
	case "form":
		result.DetailLayoutJSON = nil
	case "detail":
		result.FormLayoutJSON = nil
	default:
		// 未传或未知 state：返回完整配置，保持旧行为
	}
	return result, nil
}

// ApplicationDataList 动态数据列表查询：
//  1. 按 table_name 定位页面配置归属的业务物理表（含前缀）
//  2. 动态搜索字段（field_key）经真实列名校验后拼装等值条件，值走参数绑定，防 SQL 注入
//  3. 过滤软删除行，支持分页，返回标准分页结构
func ApplicationDataList(appID uint, req *model.ApplicationDataListReq) ([]map[string]interface{}, int64, error) {
	real, err := getApplicationBizTableBy(appID, req.TableName)
	if err != nil {
		return nil, 0, err
	}
	// 校验动态搜索字段均为表中真实列，避免注入
	colSet, err := queryColumnSet(real)
	if err != nil {
		return nil, 0, err
	}
	conds := []string{}
	args := []interface{}{}
	if colSet["deleted_at"] {
		conds = append(conds, "`deleted_at` IS NULL")
	}
	// 按审核状态过滤（Status 为 nil 表示不过滤；0 草稿可查；业务表无该列时忽略，兼容旧表）
	if req.Status != nil && colSet["approval_status"] {
		conds = append(conds, "`approval_status` = ?")
		args = append(args, *req.Status)
	}
	// 排除草稿（审核人视角的已提交列表，如 by-code list 态）
	if req.ExcludeDraft && colSet["approval_status"] {
		conds = append(conds, "`approval_status` <> ?")
		args = append(args, model.ApprovalStatusDraft)
	}
	for k, v := range req.Filters {
		if !colSet[k] {
			return nil, 0, fmt.Errorf("搜索字段不存在: %s", k)
		}
		conds = append(conds, "`"+k+"` = ?")
		args = append(args, v)
	}
	where := ""
	if len(conds) > 0 {
		where = " WHERE " + strings.Join(conds, " AND ")
	}
	table := "`" + real + "`"

	var total int64
	if err := database.DB.Raw("SELECT COUNT(*) FROM "+table+where, args...).Scan(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []map[string]interface{}
	if err := database.DB.Raw("SELECT * FROM "+table+where+" ORDER BY `id` DESC LIMIT ? OFFSET ?",
		append(args, req.Limit(), req.Offset())...).Scan(&list).Error; err != nil {
		return nil, 0, err
	}
	if list == nil {
		list = []map[string]interface{}{}
	}
	return list, total, nil
}

// ApplicationDataDetail 动态数据详情：
//  1. 根据应用配置的主表 table_name 查询 dataId 对应行（过滤软删除）
//  2. 应用配置了子表时，按子表 parent_id 关联查询子表数据
//  3. 子表数据以子表名（table_key）为 key 挂到返回对象顶层，前端按 detailData[table_key] 读取
func ApplicationDataDetail(appID, dataID uint, req *model.ApplicationDataDetailReq) (map[string]interface{}, error) {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return nil, err
	}
	if !isValidTableName(app.TableName) {
		return nil, errors.New("非法的表名")
	}
	mainReal := bizTableName(app.TableName)
	mainColSet, err := queryColumnSet(mainReal)
	if err != nil {
		return nil, err
	}

	var main map[string]interface{}
	sql := "SELECT * FROM `" + mainReal + "` WHERE `id` = ?"
	if mainColSet["deleted_at"] {
		sql += " AND `deleted_at` IS NULL"
	}
	if err := database.DB.Raw(sql, dataID).Scan(&main).Error; err != nil {
		return nil, err
	}
	if main == nil {
		return nil, errors.New("数据不存在")
	}

	// 子表数据：按 parent_id 关联主表主键
	if app.SubTableName != "" {
		for _, sub := range strings.Split(app.SubTableName, ",") {
			sub = strings.TrimSpace(sub)
			if sub == "" || !isValidTableName(sub) {
				continue
			}
			subReal := bizTableName(sub)
			var rows []map[string]interface{}
			subSQL := "SELECT * FROM `" + subReal + "` WHERE `parent_id` = ?"
			if subColSet, err := queryColumnSet(subReal); err == nil && subColSet["deleted_at"] {
				subSQL += " AND `deleted_at` IS NULL"
			}
			subSQL += " ORDER BY `id` ASC"
			if err := database.DB.Raw(subSQL, dataID).Scan(&rows).Error; err != nil {
				return nil, err
			}
			if rows == nil {
				rows = []map[string]interface{}{}
			}
			main[sub] = rows
		}
	}
	return main, nil
}

// appSystemCols 动态业务数据系统字段：由后端自动管理，不接受前端写入（Create/Update 共用）
var appSystemCols = map[string]bool{
	"id": true, "created_at": true, "updated_at": true,
	"deleted_at": true, "created_by": true, "updated_by": true,
	"approval_status": true, // 审核状态由审核接口/默认值管理
}

// ApplicationDataCreate 动态业务数据新增（支持主表 + 子表）：
//  1. 根据应用配置获取主表名，拼接前缀得到真实物理表
//  2. 区分主表字段与子表数据：key 匹配子表名时视为子表行数据（[]interface{}），不作为主表字段校验
//  3. 主表字段经真实列校验后拼装 INSERT，自动填充审计字段
//  4. 主表 INSERT 成功后获取自增主键 ID
//  5. 遍历子表数据，为每行填充 parent_id（= 主表 ID）及审计字段，校验列合法性后逐行 INSERT
func ApplicationDataCreate(appID uint, curUserID uint, data map[string]interface{}) (uint, error) {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return 0, err
	}
	if !isValidTableName(app.TableName) {
		return 0, errors.New("非法的表名")
	}
	real := bizTableName(app.TableName)

	// 查询主表中真实列，校验提交字段合法性
	mainColSet, err := queryColumnSet(real)
	if err != nil {
		return 0, fmt.Errorf("查询表结构失败: %w", err)
	}

	// 构建子表名集合（与 ApplicationDataDetail 保持一致的拆分逻辑）
	subTableSet := map[string]bool{}
	if app.SubTableName != "" {
		for _, sub := range strings.Split(app.SubTableName, ",") {
			sub = strings.TrimSpace(sub)
			if sub != "" && isValidTableName(sub) {
				subTableSet[sub] = true
			}
		}
	}

	// 提取初始审核状态（仅允许 0 草稿 / 1 待审核，默认待审核）：
	// 前端可在创建时传 approval_status=0 实现“保存草稿”，提交审核由审核接口 0→1 完成
	initialStatus := model.ApprovalStatusPending
	if v, ok := data["approval_status"]; ok {
		if !mainColSet["approval_status"] {
			return 0, errors.New("业务表缺少审核状态字段")
		}
		switch s := v.(type) {
		case float64: // JSON 数字默认解析为 float64
			if s == float64(model.ApprovalStatusDraft) {
				initialStatus = model.ApprovalStatusDraft
			} else if s != float64(model.ApprovalStatusPending) {
				return 0, errors.New("非法的初始审核状态")
			}
		default:
			return 0, errors.New("非法的初始审核状态")
		}
		delete(data, "approval_status") // 从动态字段中移除，不参与通用列校验
	}

	// 分离主表字段与子表数据
	mainColumns := []string{}
	mainPlaceholders := []string{}
	mainArgs := []interface{}{}
	subData := map[string][]interface{}{} // 子表名 → 行数据数组

	for k, v := range data {
		// key 匹配子表名时，将值视为子表行数组，跳过主表字段校验
		if subTableSet[k] {
			rows, ok := v.([]interface{})
			if !ok {
				return 0, fmt.Errorf("子表 %s 的数据格式错误，期望数组", k)
			}
			subData[k] = rows
			continue
		}
		if appSystemCols[k] {
			continue
		}
		if !mainColSet[k] {
			return 0, fmt.Errorf("字段不存在: %s", k)
		}
		mainColumns = append(mainColumns, "`"+k+"`")
		mainPlaceholders = append(mainPlaceholders, "?")
		mainArgs = append(mainArgs, v)
	}

	// 自动填充主表审计字段与初始审核状态（旧表无 approval_status 列时仅填充审计字段）
	now := time.Now()
	mainColumns = append(mainColumns, "`created_at`", "`updated_at`", "`created_by`", "`updated_by`")
	mainPlaceholders = append(mainPlaceholders, "?", "?", "?", "?")
	mainArgs = append(mainArgs, now, now, curUserID, curUserID)
	if mainColSet["approval_status"] {
		mainColumns = append(mainColumns, "`approval_status`")
		mainPlaceholders = append(mainPlaceholders, "?")
		mainArgs = append(mainArgs, initialStatus)
	}

	mainSQL := fmt.Sprintf(
		"INSERT INTO `%s` (%s) VALUES (%s)",
		real,
		strings.Join(mainColumns, ","),
		strings.Join(mainPlaceholders, ","),
	)

	if err := database.DB.Exec(mainSQL, mainArgs...).Error; err != nil {
		return 0, fmt.Errorf("插入数据失败: %w", err)
	}

	// 获取主表自增主键
	var id uint
	if err := database.DB.Raw("SELECT LAST_INSERT_ID()").Scan(&id).Error; err != nil {
		return 0, err
	}

	// 子表数据插入：主表 INSERT 成功后，逐子表、逐行写入
	for subName, rows := range subData {
		if !isValidTableName(subName) {
			return 0, fmt.Errorf("非法的子表名: %s", subName)
		}
		subReal := bizTableName(subName)
		if !isValidTableName(subReal) {
			return 0, fmt.Errorf("子表名附加前缀后不合法: %s", subReal)
		}
		subColSet, err := queryColumnSet(subReal)
		if err != nil {
			return 0, fmt.Errorf("查询子表 %s 结构失败: %w", subName, err)
		}

		for i, row := range rows {
			rowMap, ok := row.(map[string]interface{})
			if !ok {
				return 0, fmt.Errorf("子表 %s 第 %d 行数据格式错误，期望对象", subName, i+1)
			}

			subColumns := []string{"`parent_id`"}
			subPlaceholders := []string{"?"}
			subArgs := []interface{}{id} // parent_id = 主表新 ID

			for k, v := range rowMap {
				if appSystemCols[k] || k == "parent_id" {
					continue
				}
				if !subColSet[k] {
					return 0, fmt.Errorf("子表 %s 字段不存在: %s", subName, k)
				}
				subColumns = append(subColumns, "`"+k+"`")
				subPlaceholders = append(subPlaceholders, "?")
				subArgs = append(subArgs, v)
			}

			// 自动填充子表审计字段
			subColumns = append(subColumns, "`created_at`", "`updated_at`", "`created_by`", "`updated_by`")
			subPlaceholders = append(subPlaceholders, "?", "?", "?", "?")
			subArgs = append(subArgs, now, now, curUserID, curUserID)

			subSQL := fmt.Sprintf(
				"INSERT INTO `%s` (%s) VALUES (%s)",
				subReal,
				strings.Join(subColumns, ","),
				strings.Join(subPlaceholders, ","),
			)

			if err := database.DB.Exec(subSQL, subArgs...).Error; err != nil {
				return 0, fmt.Errorf("插入子表 %s 数据失败: %w", subName, err)
			}
		}
	}

	return id, nil
}

// ApplicationDataDelete 动态业务数据删除（列表页删除行）：
//  1. 根据应用配置获取主表真实物理表名，校验目标行存在（过滤软删除）
//  2. 删除策略：业务表有 deleted_at 列时软删除（与列表/详情查询的 deleted_at IS NULL 过滤语义一致），
//     表无 deleted_at 列时降级为物理删除
//  3. 级联处理子表数据（parent_id = dataId），删除策略与主表一致，避免产生孤儿数据
func ApplicationDataDelete(appID, dataID uint) error {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return err
	}
	if !isValidTableName(app.TableName) {
		return errors.New("非法的表名")
	}
	real := bizTableName(app.TableName)

	// 校验目标行存在（过滤软删除）
	var cnt int64
	if err := database.DB.Raw("SELECT COUNT(*) FROM `"+real+"` WHERE `id` = ? AND `deleted_at` IS NULL", dataID).Scan(&cnt).Error; err != nil {
		return err
	}
	if cnt == 0 {
		return errors.New("数据不存在")
	}

	// 删除主表行：有 deleted_at 列用软删除，否则物理删除
	mainColSet, err := queryColumnSet(real)
	if err != nil {
		return fmt.Errorf("查询表结构失败: %w", err)
	}
	if mainColSet["deleted_at"] {
		// 软删除：置 deleted_at，并同步审核状态为已删除（表无该列时仅置 deleted_at，兼容旧表）
		if mainColSet["approval_status"] {
			if err := database.DB.Exec("UPDATE `"+real+"` SET `deleted_at` = ?, `approval_status` = ? WHERE `id` = ?",
				time.Now(), model.ApprovalStatusDeleted, dataID).Error; err != nil {
				return fmt.Errorf("删除数据失败: %w", err)
			}
		} else {
			if err := database.DB.Exec("UPDATE `"+real+"` SET `deleted_at` = ? WHERE `id` = ?", time.Now(), dataID).Error; err != nil {
				return fmt.Errorf("删除数据失败: %w", err)
			}
		}
	} else {
		if err := database.DB.Exec("DELETE FROM `"+real+"` WHERE `id` = ?", dataID).Error; err != nil {
			return fmt.Errorf("删除数据失败: %w", err)
		}
	}

	// 级联处理子表数据（parent_id = dataId），策略与主表一致
	if app.SubTableName != "" {
		for _, sub := range strings.Split(app.SubTableName, ",") {
			sub = strings.TrimSpace(sub)
			if sub == "" || !isValidTableName(sub) {
				continue
			}
			subReal := bizTableName(sub)
			subColSet, err := queryColumnSet(subReal)
			if err != nil {
				return fmt.Errorf("查询子表 %s 结构失败: %w", sub, err)
			}
			if subColSet["deleted_at"] {
				if err := database.DB.Exec("UPDATE `"+subReal+"` SET `deleted_at` = ? WHERE `parent_id` = ?", time.Now(), dataID).Error; err != nil {
					return fmt.Errorf("删除子表 %s 数据失败: %w", sub, err)
				}
			} else {
				if err := database.DB.Exec("DELETE FROM `"+subReal+"` WHERE `parent_id` = ?", dataID).Error; err != nil {
					return fmt.Errorf("删除子表 %s 数据失败: %w", sub, err)
				}
			}
		}
	}
	return nil
}

// ApplicationDataUpdate 动态业务数据更新（编辑表单提交）：
//  1. 根据应用配置获取主表真实物理表名，校验目标记录存在（过滤软删除）
//  2. 区分主表字段与子表数据：key 匹配子表名且值为数组时视为子表行数据，不作为主表字段校验
//  3. 主表字段经真实列校验后拼装 UPDATE，自动更新 updated_at/updated_by，且不允许修改系统字段与主键
//  4. 子表数据：先清理旧数据（parent_id = dataId，有 deleted_at 软删、否则物理删），
//     再遍历新数据逐行校验列合法性后重新 INSERT（自动填充 parent_id 及审计字段）
func ApplicationDataUpdate(appID, dataID uint, curUserID uint, data map[string]interface{}) error {
	app, err := ApplicationDetail(appID)
	if err != nil {
		return err
	}
	if !isValidTableName(app.TableName) {
		return errors.New("非法的表名")
	}
	real := bizTableName(app.TableName)

	// 校验目标记录存在（过滤软删除）
	var cnt int64
	if err := database.DB.Raw("SELECT COUNT(*) FROM `"+real+"` WHERE `id` = ? AND `deleted_at` IS NULL", dataID).Scan(&cnt).Error; err != nil {
		return err
	}
	if cnt == 0 {
		return errors.New("数据不存在")
	}

	mainColSet, err := queryColumnSet(real)
	if err != nil {
		return fmt.Errorf("查询表结构失败: %w", err)
	}

	// 构建子表名集合（与 ApplicationDataCreate 保持一致的拆分逻辑）
	subTableSet := map[string]bool{}
	if app.SubTableName != "" {
		for _, sub := range strings.Split(app.SubTableName, ",") {
			sub = strings.TrimSpace(sub)
			if sub != "" && isValidTableName(sub) {
				subTableSet[sub] = true
			}
		}
	}

	// 分离主表字段与子表数据
	sets := []string{}
	args := []interface{}{}
	subData := map[string][]interface{}{} // 子表名 → 行数据数组

	for k, v := range data {
		// key 匹配子表名时，将值视为子表行数组，跳过主表字段校验
		if subTableSet[k] {
			rows, ok := v.([]interface{})
			if !ok {
				return fmt.Errorf("子表 %s 的数据格式错误，期望数组", k)
			}
			subData[k] = rows
			continue
		}
		if appSystemCols[k] {
			continue
		}
		if !mainColSet[k] {
			return fmt.Errorf("字段不存在: %s", k)
		}
		sets = append(sets, "`"+k+"` = ?")
		args = append(args, v)
	}

	// 自动更新审计字段
	now := time.Now()
	sets = append(sets, "`updated_at` = ?", "`updated_by` = ?")
	args = append(args, now, curUserID)

	updateSQL := fmt.Sprintf("UPDATE `%s` SET %s WHERE `id` = ? AND `deleted_at` IS NULL",
		real, strings.Join(sets, ","))
	args = append(args, dataID)
	if err := database.DB.Exec(updateSQL, args...).Error; err != nil {
		return fmt.Errorf("更新数据失败: %w", err)
	}

	// 子表数据更新：先清理旧数据，再逐行插入新数据
	for subName, rows := range subData {
		if !isValidTableName(subName) {
			return fmt.Errorf("非法的子表名: %s", subName)
		}
		subReal := bizTableName(subName)
		if !isValidTableName(subReal) {
			return fmt.Errorf("子表名附加前缀后不合法: %s", subReal)
		}
		subColSet, err := queryColumnSet(subReal)
		if err != nil {
			return fmt.Errorf("查询子表 %s 结构失败: %w", subName, err)
		}

		// 清理旧子表数据：有 deleted_at 列软删，否则物理删
		if subColSet["deleted_at"] {
			if err := database.DB.Exec("UPDATE `"+subReal+"` SET `deleted_at` = ? WHERE `parent_id` = ?", now, dataID).Error; err != nil {
				return fmt.Errorf("清理子表 %s 旧数据失败: %w", subName, err)
			}
		} else {
			if err := database.DB.Exec("DELETE FROM `"+subReal+"` WHERE `parent_id` = ?", dataID).Error; err != nil {
				return fmt.Errorf("清理子表 %s 旧数据失败: %w", subName, err)
			}
		}

		// 逐行插入新数据（复用 ApplicationDataCreate 的子表行逻辑）
		for i, row := range rows {
			rowMap, ok := row.(map[string]interface{})
			if !ok {
				return fmt.Errorf("子表 %s 第 %d 行数据格式错误，期望对象", subName, i+1)
			}
			subColumns := []string{"`parent_id`"}
			subPlaceholders := []string{"?"}
			subArgs := []interface{}{dataID} // parent_id = 主表记录 ID

			for k, v := range rowMap {
				if appSystemCols[k] || k == "parent_id" {
					continue
				}
				if !subColSet[k] {
					return fmt.Errorf("子表 %s 字段不存在: %s", subName, k)
				}
				subColumns = append(subColumns, "`"+k+"`")
				subPlaceholders = append(subPlaceholders, "?")
				subArgs = append(subArgs, v)
			}

			// 自动填充子表审计字段
			subColumns = append(subColumns, "`created_at`", "`updated_at`", "`created_by`", "`updated_by`")
			subPlaceholders = append(subPlaceholders, "?", "?", "?", "?")
			subArgs = append(subArgs, now, now, curUserID, curUserID)

			subSQL := fmt.Sprintf(
				"INSERT INTO `%s` (%s) VALUES (%s)",
				subReal,
				strings.Join(subColumns, ","),
				strings.Join(subPlaceholders, ","),
			)
			if err := database.DB.Exec(subSQL, subArgs...).Error; err != nil {
				return fmt.Errorf("插入子表 %s 数据失败: %w", subName, err)
			}
		}
	}

	return nil
}

// approvalStatusName 审核状态的中文名（用于状态机报错提示）
func approvalStatusName(status int) string {
	switch status {
	case model.ApprovalStatusDraft:
		return "草稿"
	case model.ApprovalStatusPending:
		return "待审核"
	case model.ApprovalStatusReviewing:
		return "审核中"
	case model.ApprovalStatusPassed:
		return "已通过"
	case model.ApprovalStatusRejected:
		return "不通过"
	case model.ApprovalStatusReturned:
		return "已驳回"
	case model.ApprovalStatusVoided:
		return "已作废"
	case model.ApprovalStatusDeleted:
		return "已删除"
	default:
		return fmt.Sprintf("未知(%d)", status)
	}
}

// code 唯一性校验：GORM 软删除只加 deleted_at 条件，而数据库唯一索引覆盖全部行（含软删除），
// 因此查重必须 Unscoped 带上已删除记录，否则检查通过但入库仍撞唯一键报 Error 1062
func checkApplicationCodeExists(code string, excludeID uint) bool {
	var count int64
	db := database.DB.Unscoped().Model(&model.Application{}).Where("code = ?", code)
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	db.Count(&count)
	return count > 0
}

// tableNamePattern 表名合法性：字母/数字/下划线，首字符为字母或下划线，总长不超过 64，防 SQL 注入
var tableNamePattern = regexp.MustCompile(`^[a-zA-Z_][a-zA-Z0-9_]{0,63}$`)

func isValidTableName(name string) bool {
	return tableNamePattern.MatchString(name)
}

// createBizTable 动态创建业务数据表（应用配置的表前缀）。
// 基础结构：主键 + 审计字段 + 软删除标记；withParent 为 true（子表）时额外添加 parent_id 关联主表。
// comment 为物理表注释（主表=页面名称，子表=页面名称+"子表"），注释中的单引号转义防 SQL 注入/语法错误。
func createBizTable(tableName string, withParent bool, comment string) error {
	if !isValidTableName(tableName) {
		return fmt.Errorf("非法的表名: %q", tableName)
	}
	real := bizTableName(tableName)
	if !isValidTableName(real) {
		return fmt.Errorf("表名附加前缀后不合法: %q", real)
	}
	var b strings.Builder
	b.WriteString("CREATE TABLE IF NOT EXISTS `")
	b.WriteString(real)
	b.WriteString("` (")
	b.WriteString("`id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '主键ID',")
	b.WriteString("`created_at` datetime(3) DEFAULT NULL COMMENT '创建时间',")
	b.WriteString("`updated_at` datetime(3) DEFAULT NULL COMMENT '更新时间',")
	b.WriteString("`created_by` bigint unsigned DEFAULT NULL COMMENT '创建人',")
	b.WriteString("`updated_by` bigint unsigned DEFAULT NULL COMMENT '更新人',")
	b.WriteString("`deleted_at` datetime(3) DEFAULT NULL COMMENT '删除时间',")
	b.WriteString("`approval_status` tinyint NOT NULL DEFAULT 1 COMMENT '审核状态 0草稿 1待审核 2审核中 3已通过 4不通过 5已驳回 6已作废 7已删除',")
	if withParent {
		// 子表：额外添加关联主表的外键字段
		b.WriteString("`parent_id` bigint unsigned DEFAULT NULL COMMENT '关联主表ID',")
	}
	b.WriteString("PRIMARY KEY (`id`),")
	b.WriteString("KEY `idx_deleted_at` (`deleted_at`)")
	b.WriteString(") ENGINE=InnoDB DEFAULT CHARSET=utf8mb4")
	if comment != "" {
		b.WriteString(" COMMENT='")
		b.WriteString(strings.ReplaceAll(comment, "'", "''"))
		b.WriteString("'")
	}
	return database.DB.Exec(b.String()).Error
}

// createBizTables 按逗号分隔的多个表名逐个建表（自动跳过空白项）：
// 主表不添加 parent_id、注释为页面名称；子表添加 parent_id 关联主表、注释为页面名称+"子表"
func createBizTables(tableName, subTableName, pageName string) error {
	if err := createBizTable(tableName, false, pageName); err != nil {
		return fmt.Errorf("创建业务表失败: %w", err)
	}
	for _, sub := range strings.Split(subTableName, ",") {
		sub = strings.TrimSpace(sub)
		if sub == "" {
			continue
		}
		if err := createBizTable(sub, true, pageName+"子表"); err != nil {
			return fmt.Errorf("创建子表失败: %w", err)
		}
	}
	return nil
}

// ApplicationCreate 新增页面配置：
//  1. 根据 TableName/SubTableName（逗号分隔）动态创建业务数据表
//  2. 自动生成 code（app- + Unix 时间戳），忽略前端传入值
//  3. 持久化配置（含布局 JSON）
func ApplicationCreate(curUserID uint, req *model.ApplicationCreateReq) (*model.Application, error) {
	if err := createBizTables(req.TableName, req.SubTableName, req.Name); err != nil {
		return nil, err
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	app := model.Application{
		Name:             req.Name,
		Code:             fmt.Sprintf("app_%d", time.Now().Unix()), // 自动生成，忽略前端传入
		TableName:        req.TableName,
		SubTableName:     req.SubTableName,
		Status:           status,
		FormLayoutJSON:   req.FormLayoutJSON,
		DetailLayoutJSON: req.DetailLayoutJSON,
	}
	app.CreatedBy, app.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&app).Error; err != nil {
		return nil, err
	}
	return &app, nil
}

// ApplicationUpdate 修改页面配置，并同步变更到底层物理业务表（DDL 失败即中断，保证配置与物理表一致）：
//  1. 页面名称（Name）变化：遍历主表和所有现存子表，ALTER TABLE ... COMMENT 更新表注释
//     （主表注释=页面名称，子表注释=页面名称+"子表"）
//  2. 主表名（TableName）变化：RENAME TABLE 旧主表 TO 新主表，并同步新主表表注释
//  3. 子表名（SubTableName）变化：对比新旧子表列表——新增的子表 CREATE TABLE（带注释），
//     被移除的子表 DROP TABLE IF EXISTS 物理删除
//     所有动态表名执行 DDL 前均经 isValidTableName 合法性校验（防 SQL 注入）
func ApplicationUpdate(curUserID, id uint, req *model.ApplicationUpdateReq) (*model.Application, error) {
	var app model.Application
	if err := database.DB.First(&app, id).Error; err != nil {
		return nil, errors.New("页面配置不存在")
	}

	// 计算字段变化（空串视为未变更，不触发 DDL）
	nameChanged := req.Name != nil && *req.Name != "" && *req.Name != app.Name
	tableChanged := req.TableName != nil && *req.TableName != "" && *req.TableName != app.TableName
	subChanged := req.SubTableName != nil && *req.SubTableName != app.SubTableName

	// 变更后生效的页面名称（用于表注释）
	effectiveName := app.Name
	if nameChanged {
		effectiveName = *req.Name
	}

	// 1. 主表名变化：物理重命名 + 同步新主表注释
	if tableChanged {
		if !isValidTableName(*req.TableName) {
			return nil, fmt.Errorf("非法的表名: %q", *req.TableName)
		}
		oldReal := bizTableName(app.TableName)
		newReal := bizTableName(*req.TableName)
		if !isValidTableName(oldReal) || !isValidTableName(newReal) {
			return nil, errors.New("表名附加前缀后不合法")
		}
		if err := database.DB.Exec("RENAME TABLE `" + oldReal + "` TO `" + newReal + "`").Error; err != nil {
			return nil, fmt.Errorf("重命名主表失败: %w", err)
		}
		// 同步新主表表注释（值为变更后生效的页面名称）
		if err := alterTableComment(newReal, effectiveName); err != nil {
			return nil, fmt.Errorf("更新主表注释失败: %w", err)
		}
	}

	// 2. 子表名变化：新增子表建表（带注释），被移除的子表物理删除
	if subChanged {
		oldSubs := splitTableNames(app.SubTableName)
		newSubs := splitTableNames(*req.SubTableName)
		oldSet := tableNameSet(oldSubs)
		newSet := tableNameSet(newSubs)

		// 被移除的子表：DROP TABLE IF EXISTS 物理删除
		for _, s := range oldSubs {
			if newSet[s] {
				continue
			}
			if !isValidTableName(s) {
				return nil, fmt.Errorf("非法的子表名: %q", s)
			}
			real := bizTableName(s)
			if !isValidTableName(real) {
				return nil, fmt.Errorf("子表名附加前缀后不合法: %q", real)
			}
			if err := database.DB.Exec("DROP TABLE IF EXISTS `" + real + "`").Error; err != nil {
				return nil, fmt.Errorf("删除子表 %s 失败: %w", s, err)
			}
		}

		// 新增的子表：CREATE TABLE（带注释）
		for _, s := range newSubs {
			if oldSet[s] {
				continue
			}
			if err := createBizTable(s, true, effectiveName+"子表"); err != nil {
				return nil, fmt.Errorf("创建子表 %s 失败: %w", s, err)
			}
		}
	}

	// 3. 页面名称变化：刷新主表 + 所有现存子表的表注释
	if nameChanged {
		curMain := app.TableName
		if tableChanged {
			curMain = *req.TableName
		}
		curMainReal := bizTableName(curMain)
		if !isValidTableName(curMainReal) {
			return nil, errors.New("表名附加前缀后不合法")
		}
		if err := alterTableComment(curMainReal, effectiveName); err != nil {
			return nil, fmt.Errorf("更新主表注释失败: %w", err)
		}
		curSubs := app.SubTableName
		if subChanged {
			curSubs = *req.SubTableName
		}
		for _, s := range splitTableNames(curSubs) {
			if !isValidTableName(s) {
				return nil, fmt.Errorf("非法的子表名: %q", s)
			}
			real := bizTableName(s)
			if !isValidTableName(real) {
				return nil, fmt.Errorf("子表名附加前缀后不合法: %q", real)
			}
			if err := alterTableComment(real, effectiveName+"子表"); err != nil {
				return nil, fmt.Errorf("更新子表 %s 注释失败: %w", s, err)
			}
		}
	}

	if req.Code != "" && req.Code != app.Code {
		if checkApplicationCodeExists(req.Code, id) {
			return nil, errors.New("页面编码已存在")
		}
		app.Code = req.Code
	}
	if req.Name != nil {
		app.Name = *req.Name
	}
	if req.TableName != nil {
		app.TableName = *req.TableName
	}
	// 以下字段使用指针，区分“未传递”（保持原值）与“主动清空”（传空串）
	if req.SubTableName != nil {
		app.SubTableName = *req.SubTableName
	}
	if req.FormLayoutJSON != nil {
		app.FormLayoutJSON = *req.FormLayoutJSON
	}
	if req.DetailLayoutJSON != nil {
		app.DetailLayoutJSON = *req.DetailLayoutJSON
	}
	if req.ApprovalFlowJSON != nil {
		app.ApprovalFlowJSON = *req.ApprovalFlowJSON
	}
	if req.Status == 1 || req.Status == 2 {
		app.Status = req.Status
	}
	app.UpdatedBy = curUserID
	if err := database.DB.Save(&app).Error; err != nil {
		return nil, err
	}
	return &app, nil
}

// splitTableNames 拆分逗号分隔的表名列表（去空白、跳过空项）
func splitTableNames(s string) []string {
	var out []string
	for _, n := range strings.Split(s, ",") {
		if n = strings.TrimSpace(n); n != "" {
			out = append(out, n)
		}
	}
	return out
}

// tableNameSet 表名列表转集合（用于新旧子表差集对比）
func tableNameSet(names []string) map[string]bool {
	set := make(map[string]bool, len(names))
	for _, n := range names {
		set[n] = true
	}
	return set
}

// alterTableComment 更新物理表注释（ALTER TABLE ... COMMENT = '...'）。
// 表名经合法性校验，注释中的单引号转义，防 SQL 注入/语法错误。
func alterTableComment(realTableName, comment string) error {
	if !isValidTableName(realTableName) {
		return fmt.Errorf("非法的表名: %q", realTableName)
	}
	escaped := strings.ReplaceAll(comment, "'", "''")
	sql := "ALTER TABLE `" + realTableName + "` COMMENT = '" + escaped + "'"
	return database.DB.Exec(sql).Error
}

// ApplicationDelete 删除页面配置（软删除），并级联物理删除关联的业务数据表：
//  1. 先按 id 查询配置记录，获取主表 TableName 与子表 SubTableName（逗号分隔多个）
//  2. 提取主表与拆分后的所有子表，经 bizTableName 拼接前缀，并经 isValidTableName 校验合法性（防 SQL 注入）
//  3. 遍历所有合法表名执行 DROP TABLE IF EXISTS 物理删除
//  4. 所有关联物理表删除成功后再软删除配置记录
//  5. 查询不到配置记录或物理删表失败均中断并返回错误
func ApplicationDelete(id uint) error {
	var app model.Application
	if err := database.DB.First(&app, id).Error; err != nil {
		return errors.New("页面配置不存在")
	}

	// 收集主表 + 子表（逗号分隔，去空白、跳过空项）待删除的表名
	names := []string{app.TableName}
	for _, sub := range strings.Split(app.SubTableName, ",") {
		if sub = strings.TrimSpace(sub); sub != "" {
			names = append(names, sub)
		}
	}

	// 拼接配置前缀并校验表名合法性，仅收集合法表名执行删除（非法表名视为脏配置跳过）
	var realNames []string
	for _, name := range names {
		if !isValidTableName(name) {
			continue
		}
		real := bizTableName(name)
		if !isValidTableName(real) {
			continue
		}
		realNames = append(realNames, real)
	}

	// 物理删除所有关联业务数据表
	for _, real := range realNames {
		if err := database.DB.Exec("DROP TABLE IF EXISTS `" + real + "`").Error; err != nil {
			return fmt.Errorf("删除业务数据表 %s 失败: %w", real, err)
		}
	}

	// 物理表全部删除成功后，再软删除配置记录
	return database.DB.Delete(&model.Application{}, id).Error
}
