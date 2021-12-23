package syncOverrides

import (
	"github.com/aws/jsii-runtime-go"
	"github.com/aws/jsii/go-runtime-test/internal/overrideAsyncMethods"
	"github.com/aws/jsii/jsii-calc/go/jsiicalc/v3"
)

type SyncOverrides struct {
	jsiicalc.SyncVirtualMethods
	AnotherTheProperty jsii.String
	Multiplier         int
	ReturnSuper        bool
	CallAsync          bool
}

func New() *SyncOverrides {
	s := &SyncOverrides{Multiplier: 1}
	jsiicalc.NewSyncVirtualMethods_Override(s)
	return s
}

func (t *SyncOverrides) VirtualMethod(n jsii.Number) jsii.Number {
	if t.ReturnSuper {
		return t.SyncVirtualMethods.VirtualMethod(n)
	}
	if t.CallAsync {
		obj := overrideAsyncMethods.New()
		return obj.CallMe()
	}
	return jsii.Number(5 * float64(n) * float64(t.Multiplier))
}

func (t *SyncOverrides) TheProperty() jsii.String {
	return jsii.String("I am an override!")
}

func (t *SyncOverrides) SetTheProperty(value jsii.String) {
	t.AnotherTheProperty = value
}
