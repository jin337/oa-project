package response

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

// 业务错误码
const (
	CodeOK          = 0    // 成功
	CodeParamError  = 400  // 参数校验失败
	CodeUnauthorized = 401 // 未登录或 token 失效
	CodeForbidden   = 403  // 无权限
	CodeNotFound    = 404  // 资源不存在
	CodeServerError = 500  // 服务器内部错误
)

// Response 统一返回格式：状态码、提示语、数据、时间戳
type Response struct {
	Code      int    `json:"code"`
	Msg       string `json:"msg"`
	Data      any    `json:"data"`
	Timestamp int64  `json:"timestamp"`
}

// PageResult 分页响应
type PageResult struct {
	List  any   `json:"list"`
	Total int64 `json:"total"`
	Page  int   `json:"page"`
	Size  int   `json:"size"`
}

func newResp(code int, msg string, data any) *Response {
	return &Response{Code: code, Msg: msg, Data: data, Timestamp: time.Now().Unix()}
}

// OK 成功返回数据
func OK(c *gin.Context, data any) {
	c.JSON(http.StatusOK, newResp(CodeOK, "success", data))
}

// OKMsg 成功返回提示
func OKMsg(c *gin.Context, msg string) {
	c.JSON(http.StatusOK, newResp(CodeOK, msg, nil))
}

// Fail 业务失败（HTTP 状态码保持 200，业务码区分）
func Fail(c *gin.Context, code int, msg string) {
	c.JSON(http.StatusOK, newResp(code, msg, nil))
}

// FailWithHTTP 业务失败且指定 HTTP 状态码
func FailWithHTTP(c *gin.Context, httpCode, code int, msg string) {
	c.JSON(httpCode, newResp(code, msg, nil))
}
