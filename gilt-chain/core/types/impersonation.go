// Copyright 2026 Gold Chain Authors
// This file is part of the go-ethereum library.

package types

import (
	"sync"

	"github.com/ethereum/go-ethereum/common"
)

// ImpersonationRegistry tracks dev-node account impersonation for local RPC testing.
// Impersonated transactions bypass signature recovery and use the declared sender.
type ImpersonationRegistry struct {
	mu        sync.RWMutex
	accounts  map[common.Address]bool
	overrides map[common.Hash]common.Address
}

var globalImpersonation = &ImpersonationRegistry{
	accounts:  make(map[common.Address]bool),
	overrides: make(map[common.Hash]common.Address),
}

// GlobalImpersonation returns the process-wide impersonation registry.
func GlobalImpersonation() *ImpersonationRegistry {
	return globalImpersonation
}

// Impersonate marks an address as impersonated for explicit RPC calls.
func (r *ImpersonationRegistry) Impersonate(addr common.Address) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.accounts[addr] = true
}

// StopImpersonating removes an address from the impersonation set.
func (r *ImpersonationRegistry) StopImpersonating(addr common.Address) {
	r.mu.Lock()
	defer r.mu.Unlock()
	delete(r.accounts, addr)
}

// IsImpersonated reports whether an address is in the impersonation set.
func (r *ImpersonationRegistry) IsImpersonated(addr common.Address) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.accounts[addr]
}

// SetSenderOverride records the sender for a transaction submitted without a keystore key.
func (r *ImpersonationRegistry) SetSenderOverride(hash common.Hash, addr common.Address) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.overrides[hash] = addr
}

// SenderOverride returns a registered sender override for a transaction hash.
func (r *ImpersonationRegistry) SenderOverride(hash common.Hash) (common.Address, bool) {
	r.mu.RLock()
	defer r.mu.RUnlock()
	addr, ok := r.overrides[hash]
	return addr, ok
}
