package service

import (
	"errors"

	"back-end/internal/database"
	"back-end/internal/middleware"
	"back-end/internal/model"

	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

// UserList 用户分页列表：按当前操作者的数据范围过滤 dept_id
func UserList(curUserID uint, req *model.UserListReq) ([]model.User, int64, error) {
	db := database.DB.Model(&model.User{})
	db = middleware.ApplyDataScope(db, curUserID, "dept_id", "created_by")
	if req.Username != "" {
		db = db.Where("username LIKE ?", "%"+req.Username+"%")
	}
	if req.DeptID > 0 {
		// 多部门归属过滤：命中任一关联部门即返回（oa_sys_user_dept 为 User.DeptIDs 的 many2many 关联表）
		db = db.Where("id IN (SELECT user_id FROM oa_sys_user_dept WHERE dept_id = ?)", req.DeptID)
	}
	var total int64
	if err := db.Count(&total).Error; err != nil {
		return nil, 0, err
	}
	var list []model.User
	// Preload Profile：账号详情表（oa_user_profiles）的 nickname 等员工档案信息随列表返回，
	// 供前端选择器（如审核人员组-审核人下拉）展示昵称，避免列表接口缺 profile 导致回退 username
	err := db.Preload("Roles").Preload("Dept").Preload("DeptIDs").Preload("Profile").
		Order("id ASC").Offset(req.Offset()).Limit(req.Limit()).Find(&list).Error
	return list, total, err
}

// UserDetail 用户详情
func UserDetail(id uint) (*model.User, error) {
	var user model.User
	if err := database.DB.Preload("Roles").Preload("Dept").Preload("DeptIDs").Preload("Profile").First(&user, id).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	return &user, nil
}

// 用户名唯一性校验：GORM 软删除只加 deleted_at 条件，而数据库唯一索引覆盖全部行（含软删除），
// 因此查重必须 Unscoped 带上已删除记录，否则检查通过但入库仍撞唯一键报 Error 1062
func checkUsernameExists(username string, excludeID uint) bool {
	var count int64
	db := database.DB.Unscoped().Model(&model.User{}).Where("username = ?", username)
	if excludeID > 0 {
		db = db.Where("id <> ?", excludeID)
	}
	db.Count(&count)
	return count > 0
}

// UserCreate 新增用户并绑定角色
func UserCreate(curUserID uint, req *model.UserCreateReq) (*model.User, error) {
	if checkUsernameExists(req.Username, 0) {
		return nil, errors.New("用户名已存在")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		return nil, errors.New("密码加密失败")
	}
	status := req.Status
	if status == 0 {
		status = 1
	}
	// 多部门归属校验（借鉴 Roles 的 many2many 绑定）：当前部门缺省时取列表第一个
	deptID := req.DeptID
	if len(req.DeptIDs) > 0 {
		if deptID == 0 {
			deptID = req.DeptIDs[0]
		} else if !containsID(req.DeptIDs, deptID) {
			return nil, errors.New("当前部门必须在所属部门列表中")
		}
	}
	user := model.User{
		Username: req.Username, Email: req.Email, Phone: req.Phone,
		Password: string(hash), Status: status, DeptID: deptID,
	}
	user.CreatedBy, user.UpdatedBy = curUserID, curUserID
	if err := database.DB.Create(&user).Error; err != nil {
		return nil, err
	}
	if len(req.DeptIDs) > 0 {
		if err := bindDepts(user.ID, req.DeptIDs); err != nil {
			return nil, err
		}
	}
	if len(req.RoleIDs) > 0 {
		if err := bindRoles(user.ID, req.RoleIDs); err != nil {
			return nil, err
		}
	}
	return UserDetail(user.ID)
}

// UserUpdate 修改用户（密码非空才重置）
func UserUpdate(curUserID, id uint, req *model.UserUpdateReq) (*model.User, error) {
	var user model.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	if req.Username != "" && req.Username != user.Username {
		if checkUsernameExists(req.Username, id) {
			return nil, errors.New("用户名已存在")
		}
		user.Username = req.Username
	}
	if req.Email != "" {
		user.Email = req.Email
	}
	if req.Phone != "" {
		user.Phone = req.Phone
	}
	if req.Status != nil {
		user.Status = *req.Status
	}
	if req.DeptIDs != nil {
		if err := bindDepts(id, req.DeptIDs); err != nil {
			return nil, err
		}
		// 当前部门不在新列表中时自动重置为第一个（仅当本次未显式指定新当前部门）
		if req.DeptID == 0 && !containsID(req.DeptIDs, user.DeptID) {
			user.DeptID = req.DeptIDs[0]
		}
	}
	if req.DeptID > 0 {
		// 用户已配置多部门归属时，当前部门必须属于该列表
		if len(req.DeptIDs) == 0 {
			var cnt int64
			database.DB.Table("oa_sys_user_dept").Where("user_id = ? AND dept_id = ?", id, req.DeptID).Count(&cnt)
			if cnt == 0 {
				return nil, errors.New("当前部门必须属于用户的归属部门列表")
			}
		}
		user.DeptID = req.DeptID
	}
	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err != nil {
			return nil, errors.New("密码加密失败")
		}
		user.Password = string(hash)
	}
	user.UpdatedBy = curUserID
	if err := database.DB.Save(&user).Error; err != nil {
		return nil, err
	}
	return UserDetail(id)
}

// UserDelete 删除用户（软删除）
func UserDelete(id uint) error {
	if id == 1 {
		return errors.New("内置管理员不可删除")
	}
	return database.DB.Delete(&model.User{}, id).Error
}

// UserAssignRoles 给用户分配角色（覆盖式）
func UserAssignRoles(userID uint, roleIDs []uint) error {
	return bindRoles(userID, roleIDs)
}

// UserUpdatePassword 修改密码（仅限本人）：校验旧密码后加密新密码入库
func UserUpdatePassword(curUserID, id uint, req *model.UpdatePasswordReq) error {
	if curUserID != id {
		return errors.New("无权修改他人密码")
	}
	var user model.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return errors.New("用户不存在")
	}
	if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.OldPassword)); err != nil {
		return errors.New("旧密码错误")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("密码加密失败")
	}
	return database.DB.Model(&user).Updates(map[string]interface{}{
		"password":   string(hash),
		"updated_by": curUserID,
	}).Error
}

// UserResetPassword 重置密码（管理员操作）：无需校验旧密码，直接加密新密码入库
func UserResetPassword(curUserID, id uint, req *model.ResetPasswordReq) error {
	if !isAdmin(curUserID) {
		return errors.New("无权限：仅管理员可重置密码")
	}
	var user model.User
	if err := database.DB.First(&user, id).Error; err != nil {
		return errors.New("用户不存在")
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return errors.New("密码加密失败")
	}
	return database.DB.Model(&user).Updates(map[string]interface{}{
		"password":   string(hash),
		"updated_by": curUserID,
	}).Error
}

// UserProfileGet 获取用户员工档案（1:1），不存在时返回空档案便于前端初始化
func UserProfileGet(userID uint) (*model.UserProfile, error) {
	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	var profile model.UserProfile
	if err := database.DB.Where("user_id = ?", userID).First(&profile).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return &model.UserProfile{UserID: userID}, nil
		}
		return nil, err
	}
	return &profile, nil
}

// UserProfileUpdate 更新员工档案（upsert，不存在则自动创建）：仅本人或管理员可操作
func UserProfileUpdate(curUserID, userID uint, req *model.UpdateProfileReq) (*model.UserProfile, error) {
	if curUserID != userID && !isAdmin(curUserID) {
		return nil, errors.New("无权更新他人档案")
	}
	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return nil, errors.New("用户不存在")
	}
	var profile model.UserProfile
	if err := database.DB.Where("user_id = ?", userID).First(&profile).Error; err != nil {
		if !errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, err
		}
		profile = model.UserProfile{UserID: userID}
		profile.CreatedBy = curUserID
	}
	profile.Nickname = req.Nickname
	profile.Avatar = req.Avatar
	profile.Gender = req.Gender
	profile.Birthday = req.Birthday
	profile.Address = req.Address
	profile.JoinDate = req.JoinDate
	profile.EmergencyContact = req.EmergencyContact
	profile.UpdatedBy = curUserID
	if err := database.DB.Save(&profile).Error; err != nil {
		return nil, err
	}
	return &profile, nil
}

// isAdmin 判断用户是否拥有管理员角色（code=admin）
func isAdmin(userID uint) bool {
	var user model.User
	if err := database.DB.Preload("Roles").First(&user, userID).Error; err != nil {
		return false
	}
	for _, r := range user.Roles {
		if r.Code == model.RoleCodeAdmin {
			return true
		}
	}
	return false
}

func bindRoles(userID uint, roleIDs []uint) error {
	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return errors.New("用户不存在")
	}
	var roles []*model.Role
	database.DB.Where("id IN ?", roleIDs).Find(&roles)
	if len(roles) != len(unique(roleIDs)) {
		return errors.New("存在不存在的角色ID")
	}
	return database.DB.Model(&user).Association("Roles").Replace(roles)
}

// bindDepts 给用户绑定多部门归属（覆盖式，借鉴 bindRoles 的 many2many Association 用法）
func bindDepts(userID uint, deptIDs []uint) error {
	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return errors.New("用户不存在")
	}
	var depts []*model.Dept
	database.DB.Where("id IN ?", deptIDs).Find(&depts)
	if len(depts) != len(unique(deptIDs)) {
		return errors.New("存在不存在的部门ID")
	}
	return database.DB.Model(&user).Association("DeptIDs").Replace(depts)
}

// UserSwitchDept 切换当前部门（DeptID）：目标部门必须属于用户的多部门归属列表
func UserSwitchDept(userID, deptID uint) error {
	if deptID == 0 {
		return errors.New("目标部门ID无效")
	}
	var user model.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		return errors.New("用户不存在")
	}
	var cnt int64
	database.DB.Table("oa_sys_user_dept").Where("user_id = ? AND dept_id = ?", userID, deptID).Count(&cnt)
	if cnt == 0 {
		return errors.New("目标部门不在用户的归属部门列表中")
	}
	return database.DB.Model(&user).Update("dept_id", deptID).Error
}

// containsID 判断 uint 切片是否包含指定值
func containsID(ids []uint, id uint) bool {
	for _, v := range ids {
		if v == id {
			return true
		}
	}
	return false
}

func unique(ids []uint) []uint {
	m := map[uint]bool{}
	out := make([]uint, 0, len(ids))
	for _, id := range ids {
		if !m[id] {
			m[id] = true
			out = append(out, id)
		}
	}
	return out
}
