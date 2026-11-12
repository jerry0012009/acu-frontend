package service

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/alicebob/miniredis/v2"
	"github.com/go-redis/redis/v8"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAuthCaptchaPurposeExpiryAndSingleUse(t *testing.T) {
	previousEnabled, previousClient := common.RedisEnabled, common.RDB
	server := miniredis.RunT(t)
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = common.RDB.Close(); common.RedisEnabled, common.RDB = previousEnabled, previousClient })
	ctx := context.Background()
	const ip = "192.0.2.1"
	challenge, err := NewAuthCaptcha(ctx, "register-email", ip)
	require.NoError(t, err)
	assert.Contains(t, challenge.Image, "data:image/png;base64,")
	// Store a known answer through the same shared challenge store, not the image generator.
	require.NoError(t, putAuthValue(ctx, "captcha:"+challenge.ID, authCaptchaDigest(challenge.ID, "register-email", ip, "12345"), 2*time.Minute))
	ok, err := VerifyAuthCaptcha(ctx, challenge.ID, "12345", "reset-email", ip)
	require.NoError(t, err)
	assert.False(t, ok, "a challenge cannot authorize a different operation")
	ok, err = VerifyAuthCaptcha(ctx, challenge.ID, "12345", "register-email", ip)
	require.NoError(t, err)
	assert.False(t, ok, "even an incorrect attempt consumes the challenge")
	require.NoError(t, putAuthValue(ctx, "captcha:"+challenge.ID, authCaptchaDigest(challenge.ID, "register-email", ip, "12345"), 2*time.Minute))
	ok, err = VerifyAuthCaptcha(ctx, challenge.ID, "12345", "register-email", ip)
	require.NoError(t, err)
	assert.True(t, ok)
	ok, err = VerifyAuthCaptcha(ctx, challenge.ID, "12345", "register-email", ip)
	require.NoError(t, err)
	assert.False(t, ok)
	require.NoError(t, putAuthValue(ctx, "captcha:expired", authCaptchaDigest("expired", "login", ip, "12345"), time.Second))
	server.FastForward(2 * time.Second)
	ok, err = VerifyAuthCaptcha(ctx, "expired", "12345", "login", ip)
	require.NoError(t, err)
	assert.False(t, ok)
}

func TestAuthLoginFailuresAreSourceAndAccountScoped(t *testing.T) {
	previous := common.RedisEnabled
	common.RedisEnabled = false
	t.Cleanup(func() { common.RedisEnabled = previous })
	ctx := context.Background()
	for i := 0; i < 3; i++ {
		required, err := LoginCaptchaRequired(ctx, "192.0.2.2", "alice")
		require.NoError(t, err)
		assert.False(t, required)
		require.NoError(t, RecordLoginFailure(ctx, "192.0.2.2", "alice"))
	}
	required, err := LoginCaptchaRequired(ctx, "192.0.2.2", "alice")
	require.NoError(t, err)
	assert.True(t, required)
	required, err = LoginCaptchaRequired(ctx, "192.0.2.3", "alice")
	require.NoError(t, err)
	assert.False(t, required, "another source cannot lock the account")
	required, err = LoginCaptchaRequired(ctx, "192.0.2.2", "bob")
	require.NoError(t, err)
	assert.False(t, required)
	require.NoError(t, ClearLoginFailures(ctx, "192.0.2.2", "alice"))
	required, err = LoginCaptchaRequired(ctx, "192.0.2.2", "alice")
	require.NoError(t, err)
	assert.False(t, required)
}

func TestAuthEmailLimitsSharedAcrossSourcesAndFailClosed(t *testing.T) {
	previousEnabled, previousClient := common.RedisEnabled, common.RDB
	server := miniredis.RunT(t)
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = common.RDB.Close(); common.RedisEnabled, common.RDB = previousEnabled, previousClient })
	ctx := context.Background()
	allowed, err := TakeAuthEmailLimit(ctx, "Alice@example.com", "register-email")
	require.NoError(t, err)
	assert.True(t, allowed)
	allowed, err = TakeAuthEmailLimit(ctx, "alice@example.com", "register-email")
	require.NoError(t, err)
	assert.False(t, allowed)
	server.FastForward(time.Minute)
	allowed, err = TakeAuthEmailLimit(ctx, "alice@example.com", "register-email")
	require.NoError(t, err)
	assert.True(t, allowed)
	for i := 0; i < 4; i++ {
		server.FastForward(time.Minute)
		allowed, err = TakeAuthEmailLimit(ctx, "alice@example.com", "register-email")
		require.NoError(t, err)
		assert.True(t, allowed)
	}
	server.FastForward(time.Minute)
	allowed, err = TakeAuthEmailLimit(ctx, "alice@example.com", "register-email")
	require.NoError(t, err)
	assert.False(t, allowed, "hourly cap survives minute cooldowns")
	server.Close()

	_, err = LoginCaptchaRequired(ctx, "192.0.2.5", "alice")
	assert.Error(t, err, "a Redis failure must not silently remove protection")
}

func TestAuthCaptchaConcurrentRedemptionHasOneWinner(t *testing.T) {
	previousEnabled, previousClient := common.RedisEnabled, common.RDB
	server := miniredis.RunT(t)
	common.RedisEnabled = true
	common.RDB = redis.NewClient(&redis.Options{Addr: server.Addr()})
	t.Cleanup(func() { _ = common.RDB.Close(); common.RedisEnabled, common.RDB = previousEnabled, previousClient })
	ctx := context.Background()
	require.NoError(t, putAuthValue(ctx, "captcha:concurrent", authCaptchaDigest("concurrent", "login", "192.0.2.40", "12345"), time.Minute))
	var winners atomic.Int32
	var group sync.WaitGroup
	for i := 0; i < 2; i++ {
		group.Add(1)
		go func() {
			defer group.Done()
			ok, err := VerifyAuthCaptcha(ctx, "concurrent", "12345", "login", "192.0.2.40")
			assert.NoError(t, err)
			if ok {
				winners.Add(1)
			}
		}()
	}
	group.Wait()
	assert.Equal(t, int32(1), winners.Load())
}
