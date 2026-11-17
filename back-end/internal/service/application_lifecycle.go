package service

import (
	"fmt"

	"back-end/internal/database"
	"back-end/internal/model"
)

// applicationStructureLocked 上线状态锁定表字段与表单元素；下架状态才允许设计变更。
func applicationStructureLocked(status int) bool {
	return status == model.ApplicationStatusOnline
}

// loadApplicationStatus 读取应用生命周期状态；应用不存在时返回数据库错误。
func loadApplicationStatus(appID uint) (int, error) {
	var app model.Application
	if err := database.DB.Select("status").First(&app, appID).Error; err != nil {
		return 0, err
	}
	return app.Status, nil
}

// requireApplicationOffline 结构变更（表字段/表单元素）必须在下架状态执行。
func requireApplicationOffline(appID uint, action string) error {
	status, err := loadApplicationStatus(appID)
	if err != nil {
		return err
	}
	if applicationStructureLocked(status) {
		return fmt.Errorf("应用上线中，无法%s；请先下架应用", action)
	}
	return nil
}

// requireApplicationOnline 运行态写操作（业务数据新增/修改/删除）必须在上线状态执行。
func requireApplicationOnline(appID uint, action string) error {
	status, err := loadApplicationStatus(appID)
	if err != nil {
		return err
	}
	if status != model.ApplicationStatusOnline {
		return fmt.Errorf("应用已下架，无法%s", action)
	}
	return nil
}
