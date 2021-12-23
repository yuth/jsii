package overrideAsyncMethods

import (
	"github.com/aws/jsii-runtime-go"
	"github.com/aws/jsii/jsii-calc/go/jsiicalc/v3"
)

type OverrideAsyncMethods struct {
	jsiicalc.AsyncVirtualMethods
}

func New() *OverrideAsyncMethods {
	o := &OverrideAsyncMethods{}
	jsiicalc.NewAsyncVirtualMethods_Override(o)
	return o
}

func (o *OverrideAsyncMethods) OverrideMe(jsii.Number) jsii.Number {
	return jsii.Number(o.Foo() * 2)
}

func (o *OverrideAsyncMethods) Foo() jsii.Number {
	return jsii.Number(222)
}

type OverrideAsyncMethodsByBaseClass struct {
	OverrideAsyncMethods
}

func NewOverrideAsyncMethodsByBaseClass() *OverrideAsyncMethodsByBaseClass {
	o := &OverrideAsyncMethodsByBaseClass{}
	o.AsyncVirtualMethods = New()
	return o
}
