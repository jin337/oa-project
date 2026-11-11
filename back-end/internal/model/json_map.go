package model

import (
	"database/sql/driver"
	"encoding/json"
	"log"
)

// JSONMap 以对象语义存储的 JSON 字段类型。
// 历史数据中若同一列被写成数组（如 dynamic_states=[]），直接反序列化到 map 会失败，
// 并让整条列表查询报错；这里对非对象结构做零值容错并记录告警，避免单行脏数据拖垮列表接口。
type JSONMap map[string]interface{}

// Value 写入 JSON 字符串；nil 写 NULL。
func (m JSONMap) Value() (driver.Value, error) {
	if m == nil {
		return nil, nil
	}
	b, err := json.Marshal(map[string]interface{}(m))
	if err != nil {
		return nil, err
	}
	return string(b), nil
}

// Scan 读取 JSON：对象正常解析；数组/标量/非法结构归零并告警，不阻断查询。
func (m *JSONMap) Scan(src interface{}) error {
	var raw []byte
	switch v := src.(type) {
	case nil:
		*m = nil
		return nil
	case []byte:
		raw = v
	case string:
		raw = []byte(v)
	default:
		log.Printf("[json_map] 非预期 JSON 列类型 %T，按空对象处理", src)
		*m = JSONMap{}
		return nil
	}
	if len(raw) == 0 {
		*m = nil
		return nil
	}
	var obj map[string]interface{}
	if err := json.Unmarshal(raw, &obj); err == nil {
		*m = JSONMap(obj)
		return nil
	}
	var arr []interface{}
	if err := json.Unmarshal(raw, &arr); err == nil {
		log.Printf("[json_map] 列值被存成数组，已按空对象容错: %s", string(raw))
		*m = JSONMap{}
		return nil
	}
	log.Printf("[json_map] 列值不是合法 JSON 对象，已按空对象容错: %s", string(raw))
	*m = JSONMap{}
	return nil
}
