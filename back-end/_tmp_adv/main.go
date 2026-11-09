package main

import (
	"fmt"
	"os"
	"strconv"
	"time"

	"gorm.io/driver/mysql"
	"gorm.io/gorm"
	"gorm.io/gorm/schema"
)

const (
	dsn     = "root:Kzi493399hst@tcp(127.0.0.1:3306)/oa_test?charset=utf8mb4&parseTime=true&loc=Local"
	bakPath = "D:\\Desktop\\GitHub\\full-stack-project\\back-end\\_task43_bak.txt"
	taskID  = 43
)

func main() {
	db, err := gorm.Open(mysql.Open(dsn), &gorm.Config{
		NamingStrategy: schema.NamingStrategy{TablePrefix: "oa_"},
	})
	if err != nil {
		fmt.Println("open err:", err)
		return
	}
	mode := "show"
	if len(os.Args) > 1 {
		mode = os.Args[1]
	}
	switch mode {
	case "show":
		var created time.Time
		var adv *time.Time
		db.Raw("SELECT created_at FROM oa_approval_instance_tasks WHERE id = ?", taskID).Scan(&created)
		db.Raw("SELECT advance_reminded_at FROM oa_approval_instance_tasks WHERE id = ?", taskID).Scan(&adv)
		var maxID uint
		db.Raw("SELECT COALESCE(MAX(id),0) FROM oa_notifications").Scan(&maxID)
		a := "NULL"
		if adv != nil {
			a = adv.Format("2006-01-02 15:04:05")
		}
		fmt.Printf("created=%s advance_at=%s max_noti=%d now=%s\n", created.Format("2006-01-02 15:04:05.999"), a, maxID, time.Now().Format("2006-01-02 15:04:05"))
	case "noti":
		type nrow struct {
			ID         uint
			UserID     uint
			Type       int
			Title      string
			Msg        string
			InstanceID uint
			CreatedAt  time.Time
		}
		var rows []nrow
		db.Raw("SELECT id, user_id, type, title, msg, instance_id, created_at FROM oa_notifications WHERE id > 60 ORDER BY id ASC").Scan(&rows)
		for _, n := range rows {
			fmt.Printf("noti=%d user=%d type=%d inst=%d at=%s title=%s msg=%s\n", n.ID, n.UserID, n.Type, n.InstanceID, n.CreatedAt.Format("2006-01-02 15:04:05"), n.Title, n.Msg)
		}
	case "backup":
		var created time.Time
		var adv *time.Time
		db.Raw("SELECT created_at FROM oa_approval_instance_tasks WHERE id = ?", taskID).Scan(&created)
		db.Raw("SELECT advance_reminded_at FROM oa_approval_instance_tasks WHERE id = ?", taskID).Scan(&adv)
		var maxID uint
		db.Raw("SELECT COALESCE(MAX(id),0) FROM oa_notifications").Scan(&maxID)
		a := "NULL"
		if adv != nil {
			a = adv.Format("2006-01-02 15:04:05.999")
		}
		content := created.Format("2006-01-02 15:04:05.999") + "|" + a + "|" + strconv.FormatUint(uint64(maxID), 10)
		if err := os.WriteFile(bakPath, []byte(content), 0o644); err != nil {
			fmt.Println("write err:", err)
			return
		}
		fmt.Println("BACKUP", content)
	case "set":
		secs := 240
		if len(os.Args) > 2 {
			secs, _ = strconv.Atoi(os.Args[2])
		}
		created := time.Now().Add(-time.Duration(secs) * time.Second).Format("2006-01-02 15:04:05.999")
		if err := db.Exec("UPDATE oa_approval_instance_tasks SET created_at = ?, advance_reminded_at = NULL WHERE id = ?", created, taskID).Error; err != nil {
			fmt.Println("update err:", err)
			return
		}
		fmt.Println("SET", created)
	case "restore":
		data, err := os.ReadFile(bakPath)
		if err != nil {
			fmt.Println("read err:", err)
			return
		}
		parts := []string{}
		cur := ""
		for _, r := range string(data) {
			if r == '|' {
				parts = append(parts, cur)
				cur = ""
				continue
			}
			cur += string(r)
		}
		parts = append(parts, cur)
		if len(parts) < 3 {
			fmt.Println("bad backup:", string(data))
			return
		}
		if err := db.Exec("UPDATE oa_approval_instance_tasks SET created_at = ? WHERE id = ?", parts[0], taskID).Error; err != nil {
			fmt.Println("update err:", err)
			return
		}
		if parts[1] == "NULL" || len(parts[1]) >= 10 && parts[1][:10] == "0001-01-01" {
			db.Exec("UPDATE oa_approval_instance_tasks SET advance_reminded_at = NULL WHERE id = ?", taskID)
		} else {
			db.Exec("UPDATE oa_approval_instance_tasks SET advance_reminded_at = ? WHERE id = ?", parts[1], taskID)
		}
		// 删除本次验证产生的通知，恢复通知基线
		maxID, _ := strconv.Atoi(parts[2])
		res := db.Exec("DELETE FROM oa_notifications WHERE id > ?", maxID)
		fmt.Printf("RESTORED created=%s advance=%s deleted_notifications=%d err=%v\n", parts[0], parts[1], res.RowsAffected, res.Error)
	}
}
