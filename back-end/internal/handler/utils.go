package handler

import (
	"fmt"
	"math"
	"strconv"
	"strings"

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
// POST /v1/api/utils/calculate
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
		// 表达式计算，支持类似 (100+2)*3 的表达式
		expr, ok := req.Value.(string)
		if !ok {
			response.Fail(c, response.CodeParamError, "参数错误: value 必须是表达式字符串")
			return
		}
		result, err = CalculateExpression(expr)
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
