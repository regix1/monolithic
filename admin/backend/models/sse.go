package models

// SSEMessage wraps a topic identifier and its data payload for one
// server-sent event frame. The frontend dispatches by Topic and unwraps Data
// into the matching typed model.
type SSEMessage struct {
	Topic string      `json:"topic"`
	Data  interface{} `json:"data"`
}
