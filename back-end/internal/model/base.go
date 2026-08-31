package model

import (
	"time"

	"gorm.io/gorm"
)

// BaseModel 公共字段
type BaseModel struct {
	ID        uint           `gorm:"primarykey;comment:主键ID" json:"id"`
	CreatedAt time.Time      `gorm:"comment:创建时间" json:"created_at"`
	UpdatedAt time.Time      `gorm:"comment:更新时间" json:"updated_at"`
	CreatedBy uint           `gorm:"comment:创建人" json:"created_by"`
	UpdatedBy uint           `gorm:"comment:更新人" json:"updated_by"`
	DeletedAt gorm.DeletedAt `gorm:"index;comment:删除时间(软删除)" json:"-"`
}

// BaseListReq 列表请求公共字段
type BaseListReq struct {
	Page int `json:"page" form:"page"`
	Size int `json:"size" form:"size"`
}

// Offset 计算分页偏移
func (r *BaseListReq) normalize() (page, size int) {
	page, size = r.Page, r.Size
	if page <= 0 {
		page = 1
	}
	if size <= 0 || size > 200 {
		size = 10
	}
	return page, size
}

func (r *BaseListReq) Offset() int {
	page, size := r.normalize()
	return (page - 1) * size
}

func (r *BaseListReq) Limit() int {
	_, size := r.normalize()
	return size
}
