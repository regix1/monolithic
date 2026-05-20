package logs

import (
	"io"
	"os"
	"regexp"
	"strings"
	"time"
)

// ---------- tail helper ----------

// TailFile reads the last n lines from a file by seeking from the end.
func TailFile(path string, n int) ([]string, error) {
	f, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer f.Close()

	stat, err := f.Stat()
	if err != nil {
		return nil, err
	}

	size := stat.Size()
	if size == 0 {
		return []string{}, nil
	}

	// Read backwards in chunks to find enough newlines.
	const chunkSize = 8192
	buf := make([]byte, 0, chunkSize)
	lines := 0
	offset := size

	for offset > 0 && lines <= n {
		readSize := int64(chunkSize)
		if readSize > offset {
			readSize = offset
		}
		offset -= readSize

		chunk := make([]byte, readSize)
		_, err := f.ReadAt(chunk, offset)
		if err != nil && err != io.EOF {
			return nil, err
		}

		buf = append(chunk, buf...)

		for _, b := range chunk {
			if b == '\n' {
				lines++
			}
		}
	}

	allLines := strings.Split(string(buf), "\n")

	// Trim trailing empty line from final newline.
	if len(allLines) > 0 && allLines[len(allLines)-1] == "" {
		allLines = allLines[:len(allLines)-1]
	}

	if len(allLines) > n {
		allLines = allLines[len(allLines)-n:]
	}

	return allLines, nil
}

// ---------- error log regex + typed walker ----------

// errorLogRegex matches nginx error log lines:
//
//	2026/03/16 14:52:01 [error] 123#0: *456 upstream prematurely closed...
var errorLogRegex = regexp.MustCompile(
	`^(\d{4}/\d{2}/\d{2}\s+\d{2}:\d{2}:\d{2})\s+\[(\w+)\]\s+\d+#\d+:\s+(?:\*\d+\s+)?(.*)`,
)

// ErrorLogMatch is the parsed shape of one nginx-error-log line.
type ErrorLogMatch struct {
	Time    time.Time // parsed timestamp in time.Local
	TimeRaw string    // original timestamp text from the line ("YYYY/MM/DD HH:MM:SS")
	Level   string    // e.g. "error", "warn", "info"
	Msg     string    // the rest of the line after the timestamp+level prefix
	Raw     string    // the full original line (for callers that need it verbatim)
}

// parseErrorLogLine parses one nginx-error-log line. Returns (match, true) on
// success or zero-value/false if the line doesn't match the expected format
// or the timestamp fails to parse.
func parseErrorLogLine(line string) (ErrorLogMatch, bool) {
	m := errorLogRegex.FindStringSubmatch(line)
	if m == nil {
		return ErrorLogMatch{}, false
	}
	t, err := time.ParseInLocation("2006/01/02 15:04:05", m[1], time.Local)
	if err != nil {
		return ErrorLogMatch{}, false
	}
	return ErrorLogMatch{
		Time:    t,
		TimeRaw: m[1],
		Level:   m[2],
		Msg:     m[3],
		Raw:     line,
	}, true
}

// ApplySinceFilter returns true if the line should be skipped because its
// parsed time is before since. When since.IsZero() OR parsed.IsZero() it
// always returns false (never skip). The zero-parsed case lets access-log
// walkers fall through to body even when the timestamp couldn't be parsed —
// matching the pre-refactor "safe default: keep" semantics.
func ApplySinceFilter(parsed time.Time, since time.Time) bool {
	if since.IsZero() || parsed.IsZero() {
		return false
	}
	return parsed.Before(since)
}

// ForEachLogLine walks lines and calls body for each line that (a) is
// non-empty (after TrimSpace), (b) passes the parser (when supplied), and
// (c) passes the since filter. Callers retain all bookkeeping inside body
// (dedup keys, bucket emission, etc.).
//
// The parser is invoked with three meanings, distinguished by its return
// values:
//
//   - (t, true)   — line is accepted with timestamp t; since filter applies.
//   - (zero, true) — line is accepted without a timestamp (the since filter
//     is bypassed for this line). Use this for "keep unparseable lines"
//     callers like the access-log walkers.
//   - (zero, false) — line is rejected entirely (body is not called). Use
//     this for "strict" callers like the error-log walkers.
//
// A nil parser is equivalent to a parser that always returns (zero, true):
// every non-empty trimmed line is delivered with no since filtering.
func ForEachLogLine(
	lines []string,
	since time.Time,
	parser func(string) (time.Time, bool),
	body func(line string, parsed time.Time),
) {
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		var parsed time.Time
		if parser != nil {
			t, ok := parser(line)
			if !ok {
				continue
			}
			parsed = t
		}
		if ApplySinceFilter(parsed, since) {
			continue
		}
		body(line, parsed)
	}
}

// forEachErrorLogMatch is the typed variant of ForEachLogLine for nginx
// error logs. Each line is trimmed, parsed via parseErrorLogLine, and
// then since-filtered before body is called with the resulting struct.
// This avoids the double-parse that would occur if callers had to invoke
// parseErrorLogLine again inside a ForEachLogLine body.
func forEachErrorLogMatch(
	lines []string,
	since time.Time,
	body func(m ErrorLogMatch),
) {
	for _, raw := range lines {
		line := strings.TrimSpace(raw)
		if line == "" {
			continue
		}
		m, ok := parseErrorLogLine(line)
		if !ok {
			continue
		}
		if ApplySinceFilter(m.Time, since) {
			continue
		}
		body(m)
	}
}
