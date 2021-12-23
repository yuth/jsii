package jsii

import (
	"fmt"
	"reflect"

	"github.com/aws/jsii-runtime-go/internal/kernel"
)

// UncheckedCast performs an un-checked cast from a value of type F to type T.
// It is the caller's responsibility to ensure the dynamic type of f is
// compatible with T. Incorrect use results in undefined behavior.
//
// This function returns an error if the original object is not a jsii-managed
// object, or the target type is not a jsii-manageable interface.
func UncheckedCast[T any](from interface{}) (to T, err error) {
	var ok bool
	// Fast path in case from is compatible with T.
	if to, ok = from.(T); ok {
		return
	}

	if objId, ok := kernel.GetClient().FindObjectRef(reflect.ValueOf(from)); ok {
		client := kernel.GetClient()
		toValue := reflect.ValueOf(to)
		if err = client.Types().InitJsiiProxy(toValue); err == nil {
			err = client.RegisterAlias(toValue, objId)
		}
	} else {
		err = fmt.Errorf("Attempted to cast unmanaged object %v to %T", from, to)
	}
	return
}
