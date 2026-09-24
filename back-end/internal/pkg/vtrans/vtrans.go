package vtrans

import (
	"io"
	"net/http"
	"reflect"
	"strings"
	"sync"

	"github.com/gin-gonic/gin"
	"github.com/go-playground/locales/zh"
	ut "github.com/go-playground/universal-translator"
	"github.com/go-playground/validator/v10"
	zhtrans "github.com/go-playground/validator/v10/translations/zh"
)

var (
	once  sync.Once
	v     *validator.Validate
	trans ut.Translator
)

func initValidator() {
	once.Do(func() {
		v = validator.New(validator.WithRequiredStructEnabled())
		// 错误信息里的字段名使用 label 标签（中文）
		v.RegisterTagNameFunc(func(fld reflect.StructField) string {
			name := strings.SplitN(fld.Tag.Get("label"), ",", 2)[0]
			if name == "" {
				name = fld.Name
			}
			return name
		})
		zhLocale := zh.New()
		uni := ut.New(zhLocale, zhLocale)
		trans, _ = uni.GetTranslator("zh")
		_ = zhtrans.RegisterDefaultTranslations(v, trans)
	})
}

// Validate 绑定并校验请求体，返回首个中文错误信息（空串表示通过）
// GET 请求绑定查询参数，其余请求绑定 JSON 请求体
func Validate(c *gin.Context, req any) string {
	initValidator()

	if c.Request.Method == http.MethodGet {
		if err := c.ShouldBindQuery(req); err != nil {
			return "请求参数格式错误"
		}
	} else {
		if err := c.ShouldBindJSON(req); err != nil && err != io.EOF {
			return "请求参数格式错误"
		}
	}
	if err := v.Struct(req); err != nil {
		if ves, ok := err.(validator.ValidationErrors); ok {
			for _, msg := range ves.Translate(trans) {
				return msg
			}
		}
		return "请求参数校验失败"
	}
	return ""
}
