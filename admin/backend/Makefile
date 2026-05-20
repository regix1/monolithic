# Makefile for admin/backend.
#
# Targets:
#   lint     - format check, vet, staticcheck, golangci-lint (default)
#   deadcode - whole-program unreachable-function report
#   tools    - go install commands for the optional linters
#   tidy     - go mod tidy
#   build    - go build ./...
#   test     - go test ./...

.DEFAULT_GOAL := lint
.PHONY: lint deadcode tools tidy build test

GO          ?= go
GOFMT       ?= gofmt
STATICCHECK ?= staticcheck
DEADCODE    ?= deadcode
GOLANGCI    ?= golangci-lint

# Resolve binary presence without failing the recipe.
have = $(shell command -v $(1) 2>/dev/null)

lint:
	@echo "==> gofmt -l ."
	@bad=`$(GOFMT) -l .`; \
	if [ -n "$$bad" ]; then \
		echo "gofmt: the following files need formatting:"; \
		echo "$$bad"; \
		exit 1; \
	fi
	@echo "==> $(GO) vet ./..."
	@$(GO) vet ./...
	@echo "==> staticcheck ./..."
	@if [ -n "$(call have,$(STATICCHECK))" ]; then \
		$(STATICCHECK) ./...; \
	else \
		echo "warning: staticcheck not installed; skipping (run 'make tools')"; \
	fi
	@echo "==> golangci-lint run ./..."
	@if [ -n "$(call have,$(GOLANGCI))" ]; then \
		$(GOLANGCI) run ./...; \
	else \
		echo "warning: golangci-lint not installed; skipping (run 'make tools')"; \
	fi

deadcode:
	@echo "==> deadcode ./..."
	@if [ -n "$(call have,$(DEADCODE))" ]; then \
		$(DEADCODE) ./...; \
	else \
		echo "warning: deadcode not installed; skipping (run 'make tools')"; \
	fi

tools:
	@echo "==> installing staticcheck"
	$(GO) install honnef.co/go/tools/cmd/staticcheck@latest
	@echo "==> installing deadcode"
	$(GO) install golang.org/x/tools/cmd/deadcode@latest
	@echo "==> installing golangci-lint"
	@echo "    Recommended install (paste into your shell):"
	@echo "    curl -sSfL https://raw.githubusercontent.com/golangci/golangci-lint/master/install.sh | sh -s -- -b \$$(go env GOPATH)/bin"
	@echo "    Or via go install (slower, no version pin):"
	@echo "    $(GO) install github.com/golangci/golangci-lint/cmd/golangci-lint@latest"

tidy:
	$(GO) mod tidy

build:
	$(GO) build ./...

test:
	$(GO) test ./...
