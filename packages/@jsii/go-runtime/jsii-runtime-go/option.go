package jsii

import (
	"time"

	"github.com/aws/jsii-runtime-go/internal/kernel"
)

// Option is a marker interface for all types that can be used in an optional
// parameter position. Implementations of FromOption__ typically return their
// receiver. Most users will never need to implement this interface.
type Option[T any] interface {
	// FromOption__ unwraps this Option[T] to the underlying T. Users should never
	// need to call this method directly, as it mostly serves as a marker
	// interface for optional-able values.
	FromOption__() T
}

// Unwrap dereferences an Option[T] to its underlying value. Panics if the
// Option is nil. This is equivalent to calling `o.FromOption__()`.
func Unwrap[T any](o Option[T]) T {
	if o == nil {
		panic("Attempted to unwrap nil optional!")
	}
	return o.FromOption__()
}

// Number is the jsii type system's number type. It shares the underlying
// representation of float64 and can be used as Option[Number].
type Number float64

func (f Number) FromOption__() Number {
	return f
}

// Bool is the jsii type system's bool type. It shares the underlying
// representation of bool and can be used as Option[Bool].
type Bool bool

func (b Bool) FromOption__() Bool {
	return b
}

// String is the jsii type system's string type. It shares the underlying
// representation of string and can be used as Option[String].
type String string

func (s String) FromOption__() String {
	return s
}

// Time is the jsii type system's date/time type. It shares the underlying
// representation of time.Time and can be used as Option[Time].
type Time time.Time

func (t Time) FromOption__() Time {
	return t
}

// Json is the jsii type system's JSON/object type. It shares the underlying
// representation of map[string]interface{} and can be used as Option[Json].
type Json map[string]interface{}

func (j Json) FromOption__() Json {
	return j
}

// Slice is the jsii type system's Array/List type. It shares the underlying
// representation of []T and can be used as Option[Slice[T]].
type Slice[T any] []T

func (s Slice[T]) FromOption__() Slice[T] {
	return s
}

// MakeSlice creates a SliceType[T] from a list of items.
func MakeSlice[T any](items ...T) Slice[T] {
	return Slice[T](items)
}

// Map is the jsii type system's map type. It shares the underlying
// representation of map[string]T and can be used as Option[Map[T]].
type Map[T any] map[string]T

func (m Map[T]) FromOption__() Map[T] {
	return m
}

func init() {
	kernel.RegisterBoxType[Bool, bool]()
	kernel.RegisterBoxType[Json, map[string]interface{}]()
	kernel.RegisterBoxType[Number, float64]()
	kernel.RegisterBoxType[String, string]()
	kernel.RegisterBoxType[Time, time.Time]()
}
