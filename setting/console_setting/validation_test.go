package console_setting

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestValidateAcuQuickStartMediaAcceptsImageAndVideo(t *testing.T) {
	value := `[
		{"id":1,"type":"image","url":"https://cdn.example.com/step-1.png","sortOrder":10},
		{"id":2,"type":"video","url":"https://cdn.example.com/step-2.mp4","poster":"https://cdn.example.com/poster.png","sortOrder":20}
	]`

	require.NoError(t, ValidateConsoleSettings(value, "AcuQuickStartMedia"))
}

func TestValidateAcuQuickStartMediaRejectsUnsafeOrUnknownMedia(t *testing.T) {
	tests := []struct {
		name  string
		value string
	}{
		{
			name:  "unknown type",
			value: `[{"type":"audio","url":"https://cdn.example.com/step.mp3"}]`,
		},
		{
			name:  "unsafe URL",
			value: `[{"type":"image","url":"javascript:alert(1)"}]`,
		},
		{
			name:  "missing URL",
			value: `[{"type":"video"}]`,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			assert.Error(t, ValidateConsoleSettings(test.value, "AcuQuickStartMedia"))
		})
	}
}
