package model

import (
	"strings"
	"testing"

	"github.com/QuantumNous/new-api/common"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestNewUserPasswordPolicy(t *testing.T) {
	for _, tt := range []struct {
		name, password string
		valid          bool
	}{
		{"32 ASCII characters", strings.Repeat("x", 32), true},
		{"72 byte boundary", strings.Repeat("x", 72), true},
		{"multibyte boundary", strings.Repeat("界", 24), true},
		{"too many bytes", strings.Repeat("x", 73), false},
		{"multibyte overflow", strings.Repeat("界", 25), false},
		{"too few characters", strings.Repeat("🔑", 7), false},
	} {
		t.Run(tt.name, func(t *testing.T) {
			err := common.Validate.Struct(&User{Password: tt.password})
			if !tt.valid {
				require.Error(t, err)
				return
			}
			require.NoError(t, err)
			hash, err := common.Password2Hash(tt.password)
			require.NoError(t, err)
			assert.True(t, common.ValidatePasswordAndHash(tt.password, hash))
		})
	}
}
