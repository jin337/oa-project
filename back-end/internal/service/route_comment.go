package service

import (
	"go/ast"
	"go/parser"
	"go/token"
	"os"
	"strconv"
	"strings"

	"back-end/internal/config"
)

// LoadRouteComments 解析 router 包源码，读取路由注册处的行内注释作为接口名称。
// 返回 map：key = "METHOD path"（path 不含配置前缀 {APIPrefix}），value = 行内注释文本。
// 路由注册处写法示例（见 internal/router/approval.go）：
//
//	instance.POST("", handler.ApprovalInstanceCreate) // 发起审批
//	instance.POST("/draft", handler.ApprovalInstanceSaveDraft) // 保存审批草稿
//
// 未写行内注释的路由不会进入结果，导入时也不会被导入（无需兜底规则）。
func LoadRouteComments() map[string]string {
	names := make(map[string]string)
	dir := routerSourceDir()
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, nil, parser.ParseComments)
	if err != nil {
		return names
	}
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			// 组前缀表：变量名 → 完整前缀（根组变量 api 对应配置前缀，导入路径不含此前缀，映射为空）
			prefixes := map[string]string{"api": ""}
			collectGroupPrefixes(file, prefixes)
			collectRouteComments(fset, file, prefixes, names)
		}
	}
	return names
}

// LoadRouteOrder 解析 router 源码，为每个路由注册行计算全局注册顺序键。
// 顺序 = router/router.go Setup() 中 registerXxxRoutes 的调用顺序（模块序）×10000
// + 文件内注册行行号（模块内序）。gin.Routes() 按 HTTP 方法分组返回，
// 导入时需据此恢复 router.go 的真实注册顺序。
func LoadRouteOrder() map[string]int {
	order := make(map[string]int)
	dir := routerSourceDir()
	moduleIdx := setupModuleOrder(dir)
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, nil, parser.ParseComments)
	if err != nil {
		return order
	}
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			prefixes := map[string]string{"api": ""}
			collectGroupPrefixes(file, prefixes)
			ast.Inspect(file, func(n ast.Node) bool {
				fd, ok := n.(*ast.FuncDecl)
				if !ok {
					return true
				}
				base, ok := moduleIdx[fd.Name.Name]
				if !ok {
					base = 99999 // 未出现在 Setup 中的注册函数排最后
				}
				collectRouteOrder(fset, fd, base, prefixes, order)
				return true
			})
		}
	}
	return order
}

// setupModuleOrder 读取 router/router.go 的 Setup()，按顺序给 registerXxxRoutes 编号
func setupModuleOrder(dir string) map[string]int {
	orders := make(map[string]int)
	path := dir + "/router.go"
	src, err := os.ReadFile(path)
	if err != nil {
		return orders
	}
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, src, parser.ParseComments)
	if err != nil {
		return orders
	}
	idx := 0
	ast.Inspect(f, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		// registerAuthRoutes(api) 为包内直接调用，Fun 是 *ast.Ident
		var name string
		if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
			name = sel.Sel.Name
		} else if id, ok := call.Fun.(*ast.Ident); ok {
			name = id.Name
		}
		if !strings.HasPrefix(name, "register") {
			return true
		}
		if _, seen := orders[name]; !seen {
			orders[name] = idx
			idx++
		}
		return true
	})
	return orders
}

// collectRouteOrder 记录 FuncDecl 内每个路由注册行（method+path → 全局顺序键）
func collectRouteOrder(fset *token.FileSet, fd *ast.FuncDecl, base int, prefixes map[string]string, order map[string]int) {
	ast.Inspect(fd, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		method := strings.ToUpper(sel.Sel.Name)
		switch method {
		case "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "ANY":
		default:
			return true
		}
		recv, ok := sel.X.(*ast.Ident)
		if !ok || len(call.Args) < 1 {
			return true
		}
		lit, ok := call.Args[0].(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			return true
		}
		path, err := strconv.Unquote(lit.Value)
		if err != nil {
			return true
		}
		full := joinRoutePath(prefixes[recv.Name], path)
		line := fset.Position(call.Pos()).Line
		key := method + " " + full
		if _, exists := order[key]; !exists {
			order[key] = base*10000 + line
		}
		return true
	})
}

// routerSourceDir 定位 router 源码目录（air/go run 的工作目录为 back-end）
func routerSourceDir() string {
	if _, err := os.Stat("internal/router"); err == nil {
		return "internal/router"
	}
	if _, err := os.Stat("back-end/internal/router"); err == nil {
		return "back-end/internal/router"
	}
	return "internal/router"
}

// collectGroupPrefixes 收集 Group 赋值链的前缀：
// api := r.Group(config.Cfg.Server.APIPrefix) → api = ""（根组；api 已预置空前缀兜底）
// applications := v1.Group("/application") → applications = "/application"
// instance := approval.Group("/instance") → instance = "/approval/instance"
func collectGroupPrefixes(file *ast.File, prefixes map[string]string) {
	ast.Inspect(file, func(n ast.Node) bool {
		assign, ok := n.(*ast.AssignStmt)
		if !ok || len(assign.Lhs) != 1 || len(assign.Rhs) != 1 {
			return true
		}
		lhs, ok := assign.Lhs[0].(*ast.Ident)
		if !ok {
			return true
		}
		call, ok := assign.Rhs[0].(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok || sel.Sel.Name != "Group" || len(call.Args) < 1 {
			return true
		}
		lit, ok := call.Args[0].(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			return true
		}
		path, err := strconv.Unquote(lit.Value)
		if err != nil {
			return true
		}
		if path == config.Cfg.Server.APIPrefix {
			prefixes[lhs.Name] = ""
			return true
		}
		parent := ""
		if pid, ok := sel.X.(*ast.Ident); ok {
			parent = prefixes[pid.Name]
		}
		prefixes[lhs.Name] = joinRoutePath(parent, path)
		return true
	})
}

// collectRouteComments 收集每个路由注册调用的完整路径与行内注释
func collectRouteComments(fset *token.FileSet, file *ast.File, prefixes map[string]string, names map[string]string) {
	ast.Inspect(file, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		method := strings.ToUpper(sel.Sel.Name)
		switch method {
		case "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "ANY":
		default:
			return true
		}
		recv, ok := sel.X.(*ast.Ident)
		if !ok || len(call.Args) < 1 {
			return true
		}
		lit, ok := call.Args[0].(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			return true
		}
		path, err := strconv.Unquote(lit.Value)
		if err != nil {
			return true
		}
		full := joinRoutePath(prefixes[recv.Name], path)
		if comment := inlineRouteComment(fset, file.Comments, call); comment != "" {
			names[method+" "+full] = comment
		}
		return true
	})
}

// inlineRouteComment 只取与调用同尾行、且位于调用之后的行内注释
// （前置分组注释如“// 表字段管理”在上一行，不会被误当成接口名）
func inlineRouteComment(fset *token.FileSet, comments []*ast.CommentGroup, call *ast.CallExpr) string {
	callEndLine := fset.Position(call.End()).Line
	for _, g := range comments {
		if g.Pos() < call.End() {
			continue
		}
		if fset.Position(g.Pos()).Line != callEndLine {
			continue
		}
		text := strings.TrimSpace(strings.TrimPrefix(g.Text(), "//"))
		if text != "" {
			return text
		}
	}
	return ""
}

// joinRoutePath 拼接组前缀与段路径，保证以 / 开头
func joinRoutePath(parent, path string) string {
	full := parent + path
	if full == "" {
		return "/"
	}
	if !strings.HasPrefix(full, "/") {
		full = "/" + full
	}
	return full
}

// LoadRouteModuleCategories 解析 router/router.go 的 Setup()，读取 registerXxxRoutes(api) // 分类
// 行尾注释，返回 注册函数名 → 分类名（如 registerUtilRoutes → "工具"、registerNotificationRoutes → "通知"）。
// 未写行尾注释的模块不在结果中（其下接口分类留空）。
func LoadRouteModuleCategories() map[string]string {
	cats := make(map[string]string)
	dir := routerSourceDir()
	path := dir + "/router.go"
	src, err := os.ReadFile(path)
	if err != nil {
		return cats
	}
	fset := token.NewFileSet()
	f, err := parser.ParseFile(fset, path, src, parser.ParseComments)
	if err != nil {
		return cats
	}
	ast.Inspect(f, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		var name string
		if sel, ok := call.Fun.(*ast.SelectorExpr); ok {
			name = sel.Sel.Name
		} else if id, ok := call.Fun.(*ast.Ident); ok {
			name = id.Name
		}
		if !strings.HasPrefix(name, "register") {
			return true
		}
		if c := inlineRouteComment(fset, f.Comments, call); c != "" {
			cats[name] = c
		}
		return true
	})
	return cats
}

// LoadRouteCategories 解析 router 源码，返回每条路由（key = "METHOD path"，path 不含 {APIPrefix}）
// 所属分类名。分类归属 = 该路由注册所在的 registerXxxRoutes 函数，其在 Setup() 调用行尾注释的文本。
func LoadRouteCategories() map[string]string {
	cats := make(map[string]string)
	moduleCats := LoadRouteModuleCategories()
	dir := routerSourceDir()
	fset := token.NewFileSet()
	pkgs, err := parser.ParseDir(fset, dir, nil, parser.ParseComments)
	if err != nil {
		return cats
	}
	for _, pkg := range pkgs {
		for _, file := range pkg.Files {
			prefixes := map[string]string{"api": ""}
			collectGroupPrefixes(file, prefixes)
			ast.Inspect(file, func(n ast.Node) bool {
				fd, ok := n.(*ast.FuncDecl)
				if !ok {
					return true
				}
				category, ok := moduleCats[fd.Name.Name]
				if !ok || category == "" {
					return true
				}
				collectRouteCategoriesInto(fset, fd, prefixes, category, cats)
				return true
			})
		}
	}
	return cats
}

// collectRouteCategoriesInto 收集 FuncDecl 内全部路由注册行的分类（模块级常量，覆盖该函数内所有路由）
func collectRouteCategoriesInto(fset *token.FileSet, fd *ast.FuncDecl, prefixes map[string]string, category string, out map[string]string) {
	ast.Inspect(fd, func(n ast.Node) bool {
		call, ok := n.(*ast.CallExpr)
		if !ok {
			return true
		}
		sel, ok := call.Fun.(*ast.SelectorExpr)
		if !ok {
			return true
		}
		method := strings.ToUpper(sel.Sel.Name)
		switch method {
		case "GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS", "ANY":
		default:
			return true
		}
		recv, ok := sel.X.(*ast.Ident)
		if !ok || len(call.Args) < 1 {
			return true
		}
		lit, ok := call.Args[0].(*ast.BasicLit)
		if !ok || lit.Kind != token.STRING {
			return true
		}
		routePath, err := strconv.Unquote(lit.Value)
		if err != nil {
			return true
		}
		full := joinRoutePath(prefixes[recv.Name], routePath)
		key := method + " " + full
		if _, exists := out[key]; !exists {
			out[key] = category
		}
		return true
	})
}
