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
// POST /api/v1/utils/calculate
// 支持类型：
//   - number_to_upper: 数字转大写金额
//   - number_to_lower: 数字转小写
//   - add: 加法
//   - subtract: 减法
//   - multiply: 乘法
//   - divide: 除法
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
	case "number_to_lower":
		result, err = NumberToLower(req.Value)
	case "add":
		result, err = CalculateArithmetic(req.Value, req.Params, "add")
	case "subtract":
		result, err = CalculateArithmetic(req.Value, req.Params, "subtract")
	case "multiply":
		result, err = CalculateArithmetic(req.Value, req.Params, "multiply")
	case "divide":
		result, err = CalculateArithmetic(req.Value, req.Params, "divide")
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

		// 添加大级单位
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

// NumberToLower 数字转小写（去除多余的小数位）
func NumberToLower(value interface{}) (float64, error) {
	return toFloat64(value)
}

// CalculateArithmetic 基本数学计算
func CalculateArithmetic(a, b interface{}, op string) (float64, error) {
	numA, err := toFloat64(a)
	if err != nil {
		return 0, err
	}

	numB, err := toFloat64(b)
	if err != nil {
		return 0, err
	}

	switch op {
	case "add":
		return numA + numB, nil
	case "subtract":
		return numA - numB, nil
	case "multiply":
		return numA * numB, nil
	case "divide":
		if numB == 0 {
			return 0, fmt.Errorf("除数不能为零")
		}
		return numA / numB, nil
	default:
		return 0, fmt.Errorf("不支持的运算")
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
