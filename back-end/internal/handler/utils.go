package handler

import (
	"fmt"
	"math"
	"regexp"
	"strconv"
	"strings"
	"time"

	"back-end/internal/pkg/response"

	"github.com/gin-gonic/gin"
)

// CalculateRequest 计算/转换请求
type CalculateRequest struct {
	Type   string      `json:"type" binding:"required" label:"计算类型"`
	Value  interface{} `json:"value" label:"输入值"`
	Params interface{} `json:"params" label:"其他参数"`
}

// Calculate 公共计算/转换接口
// POST /{APIPrefix}/utils/calculate
// 支持类型：
//   - number_to_upper: 数字转大写金额
//   - calc: 表达式计算（支持加减乘除和括号）
func Calculate(c *gin.Context) {
	var req CalculateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		response.Fail(c, response.CodeParamError, "参数错误: "+err.Error())
		return
	}

	var result interface{}
	var err error

	switch req.Type {
	case "number_to_upper":
		result, err = NumberToUpper(req.Value)
	case "calc":
		// 表达式计算：支持类似 (100+2)*3 的表达式；
		// 若形如「日期(时间) - 日期(时间)」则按绝对时间差返回天数
		expr, ok := req.Value.(string)
		if !ok {
			response.Fail(c, response.CodeParamError, "参数错误: value 必须是表达式字符串")
			return
		}
		days, isDateDiff, derr := TryDateDiff(expr)
		if derr != nil {
			response.Fail(c, response.CodeParamError, "计算失败: "+derr.Error())
			return
		}
		if isDateDiff {
			result = days
		} else {
			result, err = CalculateExpression(expr)
		}
	default:
		response.Fail(c, response.CodeParamError, "不支持的计算类型: "+req.Type)
		return
	}

	if err != nil {
		response.Fail(c, response.CodeServerError, "计算失败: "+err.Error())
		return
	}

	response.OK(c, gin.H{
		"result": result,
	})
}

// NumberToUpper 数字转大写金额
func NumberToUpper(value interface{}) (string, error) {
	// 空值（未传 / null / 空串 / 纯空白）视为「未填写」，返回空字符串而不报错，
	// 避免表单金额为空时调用该接口直接失败
	if isEmptyValue(value) {
		return "", nil
	}

	num, err := toFloat64(value)
	if err != nil {
		return "", err
	}

	if num == 0 {
		return "零元整", nil
	}

	// 负数处理
	negative := false
	if num < 0 {
		negative = true
		num = -num
	}

	// 分离整数和小数部分
	intPart := int64(math.Floor(num))
	decPart := int64(math.Round((num - float64(intPart)) * 100))

	// 大写数字
	digits := []string{"零", "壹", "贰", "叁", "肆", "伍", "陆", "柒", "捌", "玖"}
	// 个级单位
	smallUnits := []string{"", "拾", "佰", "仟"}
	// 大级单位（万、亿）
	bigUnits := []string{"", "万", "亿"}
	// 小数单位
	decUnits := []string{"角", "分"}

	// 转换整数部分
	intStr := strconv.FormatInt(intPart, 10)
	strLen := len(intStr)

	// 按每4位分组（从右到左）
	var groups []int
	for i := strLen; i > 0; i -= 4 {
		start := i - 4
		if start < 0 {
			start = 0
		}
		groupStr := intStr[start:i]
		group, _ := strconv.Atoi(groupStr)
		groups = append(groups, group)
	}

	// 转换每组
	intResult := ""
	firstGroup := true
	for i := len(groups) - 1; i >= 0; i-- {
		group := groups[i]
		if group == 0 {
			continue
		}

		// 转换组内数字
		groupStr := strconv.Itoa(group)
		groupResult := ""
		for j, ch := range groupStr {
			digit := int(ch - '0')
			unit := smallUnits[len(groupStr)-1-j]
			if digit == 0 {
				if !strings.HasSuffix(groupResult, "零") && groupResult != "" {
					groupResult += "零"
				}
			} else {
				groupResult += digits[digit] + unit
			}
		}
		groupResult = strings.TrimSuffix(groupResult, "零")

		// 如果不是第一组，且当前组数字小于1000（即前面有零），需要加"零"
		if !firstGroup && group < 1000 {
			intResult += "零"
		}

		// 添加大级单位（超出“亿”级直接返回错误，避免数组越界）
		if i >= len(bigUnits) {
			return "", fmt.Errorf("数值过大，暂不支持万亿及以上金额")
		}
		intResult += groupResult + bigUnits[i]
		firstGroup = false
	}

	// 去掉末尾的零
	intResult = strings.TrimSuffix(intResult, "零")
	if intResult == "" {
		intResult = "零"
	}

	// 转换小数部分
	decResult := ""
	if decPart > 0 {
		decStr := strconv.FormatInt(decPart, 10)
		if len(decStr) == 1 {
			decStr = "0" + decStr
		}
		// 有分无角（如 1.05）时，角位为零需补“零”
		if decPart < 10 {
			decResult += "零"
		}
		for i, ch := range decStr {
			digit := int(ch - '0')
			if digit > 0 {
				decResult += digits[digit] + decUnits[i]
			}
		}
	}

	// 组合结果
	result := intResult + "元"
	if decResult == "" {
		result += "整"
	} else {
		result += decResult
	}

	// 负数处理
	if negative {
		result = "负" + result
	}

	return result, nil
}

// CalculateExpression 计算数学表达式（支持加减乘除和括号）
func CalculateExpression(expr string) (float64, error) {
	// 移除所有空格
	expr = strings.ReplaceAll(expr, " ", "")
	if expr == "" {
		return 0, fmt.Errorf("表达式不能为空")
	}

	// 使用递归下降解析器
	parser := &exprParser{input: expr, pos: 0}
	result, err := parser.parseExpression()
	if err != nil {
		return 0, err
	}
	if parser.pos != len(parser.input) {
		return 0, fmt.Errorf("表达式解析错误，位置: %d", parser.pos)
	}
	return result, nil
}

// exprParser 表达式解析器
type exprParser struct {
	input string
	pos   int
}

// parseExpression 解析表达式（加减）
func (p *exprParser) parseExpression() (float64, error) {
	left, err := p.parseTerm()
	if err != nil {
		return 0, err
	}

	for p.pos < len(p.input) {
		op := p.input[p.pos]
		if op != '+' && op != '-' {
			break
		}
		p.pos++

		right, err := p.parseTerm()
		if err != nil {
			return 0, err
		}

		if op == '+' {
			left += right
		} else {
			left -= right
		}
	}

	return left, nil
}

// parseTerm 解析项（乘除取模）
func (p *exprParser) parseTerm() (float64, error) {
	left, err := p.parseFactor()
	if err != nil {
		return 0, err
	}

	for p.pos < len(p.input) {
		op := p.input[p.pos]
		if op != '*' && op != '/' && op != '%' {
			break
		}
		p.pos++

		right, err := p.parseFactor()
		if err != nil {
			return 0, err
		}

		if op == '*' {
			left *= right
		} else if op == '/' {
			if right == 0 {
				return 0, fmt.Errorf("除数不能为零")
			}
			left /= right
		} else { // %
			if right == 0 {
				return 0, fmt.Errorf("取模运算的除数不能为零")
			}
			left = math.Mod(left, right)
		}
	}

	return left, nil
}

// parseFactor 解析因子（数字或括号表达式）
func (p *exprParser) parseFactor() (float64, error) {
	if p.pos >= len(p.input) {
		return 0, fmt.Errorf("表达式不完整")
	}

	ch := p.input[p.pos]

	// 处理括号
	if ch == '(' {
		p.pos++
		result, err := p.parseExpression()
		if err != nil {
			return 0, err
		}
		if p.pos >= len(p.input) || p.input[p.pos] != ')' {
			return 0, fmt.Errorf("缺少右括号")
		}
		p.pos++
		return result, nil
	}

	// 处理数字（支持前置正负号，以及 -(表达式) 形式的负号）
	if ch == '-' || ch == '+' || (ch >= '0' && ch <= '9') || ch == '.' {
		sign := 1.0
		if ch == '-' || ch == '+' {
			if ch == '-' {
				sign = -1
			}
			p.pos++
			// 正负号后紧跟括号：-(1+2) / +(1+2)
			if p.pos < len(p.input) && p.input[p.pos] == '(' {
				inner, err := p.parseFactor()
				if err != nil {
					return 0, err
				}
				return sign * inner, nil
			}
		}
		start := p.pos
		for p.pos < len(p.input) {
			c := p.input[p.pos]
			if (c >= '0' && c <= '9') || c == '.' {
				p.pos++
			} else {
				break
			}
		}
		numStr := p.input[start:p.pos]
		if numStr == "" {
			return 0, fmt.Errorf("无效的数字")
		}
		num, err := strconv.ParseFloat(numStr, 64)
		if err != nil {
			return 0, fmt.Errorf("无效的数字: %s", numStr)
		}
		return sign * num, nil
	}

	return 0, fmt.Errorf("意外的字符: %c", ch)
}

// dateDiffRe 匹配「日期(时间) - 日期(时间)」形式的表达式，例如：
//   - 2026-10-13-2026-10-12
//   - 2026-10-13 - 2026-10-12
//   - 2026-10-13 12:00:00 - 2026-10-12 06:00:00
//   - 2026-10-13 12:00 - 2026-10-12 06:00
//
// 两侧均允许为空，用于兼容表单里取到空值的情况（如 2026-10-13- / -2026-10-13）。
var dateDiffRe = regexp.MustCompile(`^\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)?\s*-\s*(\d{4}-\d{2}-\d{2}(?:[ T]\d{2}:\d{2}(?::\d{2})?)?)?\s*$`)

// TryDateDiff 识别「日期(时间) - 日期(时间)」表达式，按绝对时间差返回天数
// （保留 2 位小数，允许负数；含时间戳时按真实时长折算，如 30 小时 = 1.25）。
// 任一侧为空时（如 2026-10-13- / -2026-10-13）视为空值参与相减，返回 0。
// 未命中该形式时返回 matched=false，交由 CalculateExpression 按普通数学表达式处理；
// 命中但日期非法时返回 matched=true 并携带错误，避免静默算出错误数值。
func TryDateDiff(expr string) (days float64, matched bool, err error) {
	m := dateDiffRe.FindStringSubmatch(expr)
	if m == nil {
		return 0, false, nil
	}

	leftStr, rightStr := strings.TrimSpace(m[1]), strings.TrimSpace(m[2])

	// 非空的一侧必须是合法日期（支持时间戳），否则报错，避免静默算出错误结果
	var left, right time.Time
	if leftStr != "" {
		t, perr := parseDateTime(leftStr)
		if perr != nil {
			return 0, true, fmt.Errorf("无效的日期: %s", leftStr)
		}
		left = t
	}
	if rightStr != "" {
		t, perr := parseDateTime(rightStr)
		if perr != nil {
			return 0, true, fmt.Errorf("无效的日期: %s", rightStr)
		}
		right = t
	}

	// 任一侧为空（如 2026-10-13- / -2026-10-13）：空值参与相减，返回 0
	if leftStr == "" || rightStr == "" {
		return 0, true, nil
	}

	days = left.Sub(right).Hours() / 24
	days = math.Round(days*100) / 100
	if days == 0 {
		days = 0 // 消除 -0
	}
	return days, true, nil
}

// parseDateTime 解析日期 / 日期时间（支持 YYYY-MM-DD、YYYY-MM-DD HH:mm、YYYY-MM-DD HH:mm:ss，也接受 T 分隔）
func parseDateTime(s string) (time.Time, error) {
	s = strings.TrimSpace(strings.ReplaceAll(s, "T", " "))
	for _, layout := range []string{"2006-01-02 15:04:05", "2006-01-02 15:04", "2006-01-02"} {
		if t, err := time.Parse(layout, s); err == nil {
			return t, nil
		}
	}
	return time.Time{}, fmt.Errorf("无法解析的时间: %s", s)
}

// isEmptyValue 判断入参是否为「空值」：未传（nil）、null、空串或纯空白字符串。
func isEmptyValue(value interface{}) bool {
	switch v := value.(type) {
	case nil:
		return true
	case string:
		return strings.TrimSpace(v) == ""
	default:
		return false
	}
}

// toFloat64 转换为 float64
func toFloat64(value interface{}) (float64, error) {
	switch v := value.(type) {
	case float64:
		return v, nil
	case int:
		return float64(v), nil
	case int64:
		return float64(v), nil
	case string:
		f, err := strconv.ParseFloat(v, 64)
		if err != nil {
			return 0, err
		}
		return f, nil
	default:
		return 0, fmt.Errorf("无法转换为数字")
	}
}
