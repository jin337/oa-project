package logger

import (
	"fmt"
	"io"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
)

// 日志级别，可通过配置文件 server.log.level 控制
const (
	levelDebug = iota
	levelInfo
	levelWarn
	levelError
)

var (
	mu     sync.Mutex
	out    io.Writer = os.Stdout
	curLvl           = levelInfo
	prefix           = map[int]string{
		levelDebug: "[DEBUG]",
		levelInfo:  "[INFO]",
		levelWarn:  "[WARN]",
		levelError: "[ERROR]",
	}
)

// Setup 初始化日志：级别 + 保存路径（路径留空则只输出控制台）
func Setup(level, path string) {
	mu.Lock()
	defer mu.Unlock()

	switch strings.ToLower(level) {
	case "debug":
		curLvl = levelDebug
	case "info":
		curLvl = levelInfo
	case "warn":
		curLvl = levelWarn
	case "error":
		curLvl = levelError
	default:
		curLvl = levelInfo
	}

	if path != "" {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err == nil {
			f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
			if err == nil {
				out = io.MultiWriter(os.Stdout, f)
			}
		}
	}
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetOutput(out)
}

func write(lvl int, format string, args ...any) {
	if lvl < curLvl {
		return
	}
	mu.Lock()
	defer mu.Unlock()
	log.SetOutput(out)
	log.Printf("%s %s", prefix[lvl], fmt.Sprintf(format, args...))
}

func Infof(format string, args ...any)  { write(levelInfo, format, args...) }
func Errorf(format string, args ...any) { write(levelError, format, args...) }
