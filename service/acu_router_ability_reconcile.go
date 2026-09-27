package service

import (
	"context"
	"fmt"
	"sync"
	"sync/atomic"
	"time"

	"github.com/QuantumNous/new-api/common"
	"github.com/QuantumNous/new-api/logger"
	"github.com/QuantumNous/new-api/model"

	"github.com/bytedance/gopkg/util/gopool"
)

const acuAbilityReconcileInterval = 5 * time.Minute

var acuAbilityReconcileOnce sync.Once
var acuAbilityReconcileRunning atomic.Bool

func StartACURouterAbilityReconcileTask() {
	acuAbilityReconcileOnce.Do(func() {
		if !common.IsMasterNode {
			return
		}
		gopool.Go(func() {
			ticker := time.NewTicker(acuAbilityReconcileInterval)
			defer ticker.Stop()
			runACURouterAbilityReconcileOnce()
			for range ticker.C {
				runACURouterAbilityReconcileOnce()
			}
		})
	})
}

func runACURouterAbilityReconcileOnce() {
	if !acuAbilityReconcileRunning.CompareAndSwap(false, true) {
		return
	}
	defer acuAbilityReconcileRunning.Store(false)
	defer func() {
		if recovered := recover(); recovered != nil {
			logger.LogError(context.Background(), fmt.Sprintf("ACU ability reconcile panic: %v", recovered))
		}
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 90*time.Second)
	defer cancel()
	catalog, err := GetACURoutingCatalog(ctx)
	if err != nil {
		logger.LogWarn(ctx, fmt.Sprintf("ACU ability reconcile skipped: routing catalog unavailable: %v", err))
		return
	}
	if err := model.ReconcileACURouterAbilities(catalog); err != nil {
		logger.LogError(ctx, fmt.Sprintf("ACU ability reconcile failed: %v", err))
		return
	}
	logger.LogInfo(ctx, "ACU ability reconcile completed")
}
