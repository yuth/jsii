package twoOverrides

import (
	"github.com/aws/jsii-runtime-go"
	"github.com/aws/jsii/jsii-calc/go/jsiicalc/v3"
)

type TwoOverrides struct {
	jsiicalc.AsyncVirtualMethods
}

func New() *TwoOverrides {
	t := &TwoOverrides{}
	jsiicalc.NewAsyncVirtualMethods_Override(t)
	return t
}

func (t *TwoOverrides) OverrideMe(jsii.Number) jsii.Number {
	return jsii.Number(666)
}

func (t *TwoOverrides) OverrideMeToo() jsii.Number {
	return jsii.Number(10)
}
