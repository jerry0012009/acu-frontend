package dto

import (
	"encoding/json"
	"github.com/QuantumNous/new-api/types"
	"github.com/gin-gonic/gin"
)

// RawBody is used for estimation only. The ACU relay forwards the original body.
type SystemOneRequest struct {
	Model     string                     `json:"model"`
	State     json.RawMessage            `json:"state"`
	Questions map[string]json.RawMessage `json:"questions"`
	Stream    *bool                      `json:"stream,omitempty"`
	RawBody   json.RawMessage            `json:"-"`
}

func (r *SystemOneRequest) GetTokenCountMeta() *types.TokenCountMeta {
	return &types.TokenCountMeta{CombineText: string(r.RawBody), TokenType: types.TokenTypeTokenizer}
}
func (r *SystemOneRequest) IsStream(c *gin.Context) bool { return false }
func (r *SystemOneRequest) SetModelName(name string)     { r.Model = name }
