package service

import (
	"bytes"
	"context"
	"crypto/subtle"
	"encoding/base64"
	"fmt"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/dchest/captcha"
	"github.com/google/uuid"
)

const authProtectionNamespace = "auth-protection:v1:"

type AuthCaptcha struct {
	ID    string `json:"id"`
	Image string `json:"image"`
}

type authMemoryValue struct {
	value   string
	expires time.Time
}

var authMemory = struct {
	sync.Mutex
	values map[string]authMemoryValue
}{values: make(map[string]authMemoryValue)}

// Redis is shared by HTTP slots; outages fail closed rather than changing stores.
func putAuthValue(ctx context.Context, key, value string, ttl time.Duration) error {
	if common.RedisEnabled {
		if common.RDB == nil {
			return fmt.Errorf("authentication store unavailable")
		}
		return common.RDB.Set(ctx, authProtectionNamespace+key, value, ttl).Err()
	}
	authMemory.Lock()
	defer authMemory.Unlock()
	for k, v := range authMemory.values {
		if time.Now().After(v.expires) {
			delete(authMemory.values, k)
		}
	}
	if len(authMemory.values) >= 10000 {
		return fmt.Errorf("authentication protection capacity reached")
	}
	authMemory.values[key] = authMemoryValue{value, time.Now().Add(ttl)}
	return nil
}

func takeAuthValue(ctx context.Context, key string) (string, error) {
	if common.RedisEnabled {
		if common.RDB == nil {
			return "", fmt.Errorf("authentication store unavailable")
		}
		value, err := common.RDB.Eval(ctx, `local v=redis.call('GET',KEYS[1]); redis.call('DEL',KEYS[1]); return v or ''`, []string{authProtectionNamespace + key}).Text()
		return value, err
	}
	authMemory.Lock()
	defer authMemory.Unlock()
	v := authMemory.values[key]
	delete(authMemory.values, key)
	if time.Now().After(v.expires) {
		return "", nil
	}
	return v.value, nil
}

func authCaptchaDigest(id, purpose, ip, answer string) string {
	return common.GenerateHMAC(id + "\x00" + purpose + "\x00" + ip + "\x00" + answer)
}

func NewAuthCaptcha(ctx context.Context, purpose, ip string) (*AuthCaptcha, error) {
	id := uuid.NewString()
	digits := captcha.RandomDigits(5)
	var answer strings.Builder
	for _, d := range digits {
		answer.WriteByte('0' + d)
	}
	var image bytes.Buffer
	if _, err := captcha.NewImage(id, digits, 180, 60).WriteTo(&image); err != nil {
		return nil, err
	}
	if err := putAuthValue(ctx, "captcha:"+id, authCaptchaDigest(id, purpose, ip, answer.String()), 2*time.Minute); err != nil {
		return nil, err
	}
	return &AuthCaptcha{ID: id, Image: "data:image/png;base64," + base64.StdEncoding.EncodeToString(image.Bytes())}, nil
}

func VerifyAuthCaptcha(ctx context.Context, id, answer, purpose, ip string) (bool, error) {
	if len(id) > 64 || len(answer) > 16 || id == "" || answer == "" {
		return false, nil
	}
	value, err := takeAuthValue(ctx, "captcha:"+id)
	if err != nil || value == "" {
		return false, err
	}
	return subtle.ConstantTimeCompare([]byte(value), []byte(authCaptchaDigest(id, purpose, ip, strings.TrimSpace(answer)))) == 1, nil
}

func authCounter(ctx context.Context, key string, ttl time.Duration, increment bool) (int, error) {
	if common.RedisEnabled {
		if common.RDB == nil {
			return 0, fmt.Errorf("authentication store unavailable")
		}
		if increment {
			return common.RDB.Eval(ctx, `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return n`, []string{authProtectionNamespace + key}, int(ttl.Seconds())).Int()
		}
		return common.RDB.Eval(ctx, `return tonumber(redis.call('GET',KEYS[1]) or '0')`, []string{authProtectionNamespace + key}).Int()
	}
	authMemory.Lock()
	defer authMemory.Unlock()
	v := authMemory.values[key]
	if time.Now().After(v.expires) {
		v = authMemoryValue{"0", time.Now().Add(ttl)}
		delete(authMemory.values, key)
	}
	n, _ := strconv.Atoi(v.value)
	if increment {
		for k, item := range authMemory.values {
			if time.Now().After(item.expires) {
				delete(authMemory.values, k)
			}
		}
		if _, exists := authMemory.values[key]; !exists && len(authMemory.values) >= 10000 {
			return 0, fmt.Errorf("authentication protection capacity reached")
		}
		n++
		v.value = strconv.Itoa(n)
		authMemory.values[key] = v
	}
	return n, nil
}

func loginFailureKey(ip, username string) string {
	return "login:" + common.GenerateHMAC(ip+"\x00"+strings.ToLower(strings.TrimSpace(username)))
}
func LoginCaptchaRequired(ctx context.Context, ip, username string) (bool, error) {
	n, err := authCounter(ctx, loginFailureKey(ip, username), 15*time.Minute, false)
	return n >= 3, err
}
func RecordLoginFailure(ctx context.Context, ip, username string) error {
	_, err := authCounter(ctx, loginFailureKey(ip, username), 15*time.Minute, true)
	return err
}
func ClearLoginFailures(ctx context.Context, ip, username string) error {
	_, err := takeAuthValue(ctx, loginFailureKey(ip, username))
	return err
}

func TakeAuthEmailLimit(ctx context.Context, email, purpose string) (bool, error) {
	key := "mail:" + purpose + ":" + common.GenerateHMAC(strings.ToLower(strings.TrimSpace(email)))
	n, err := authCounter(ctx, key+":minute", time.Minute, true)
	if err != nil || n > 1 {
		return false, err
	}
	n, err = authCounter(ctx, key+":hour", time.Hour, true)
	return n <= 6, err
}
