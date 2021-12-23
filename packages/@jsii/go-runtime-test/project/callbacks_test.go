package tests

import (
	"testing"

	"github.com/aws/jsii-runtime-go"
	calc "github.com/aws/jsii/jsii-calc/go/jsiicalc/v3"
)

func TestPureInterfacesCanBeUsedTransparently(t *testing.T) {
	requiredstring := "It's Britney b**ch!"
	expected := calc.StructB{RequiredString: jsii.String(requiredstring)}
	delegate := &StructReturningDelegate{expected: expected}
	consumer := calc.NewConsumePureInterface(delegate)
	actual := consumer.WorkItBaby()

	if actual.RequiredString != expected.RequiredString {
		t.Errorf("Expected %v; actual: %v", expected.RequiredString, actual.RequiredString)
	}
}

type StructReturningDelegate struct {
	expected calc.StructB
}

func (o *StructReturningDelegate) ReturnStruct() calc.StructB {
	return o.expected
}
