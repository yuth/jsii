package addTen

import (
	"github.com/aws/jsii-runtime-go"
	calc "github.com/aws/jsii/jsii-calc/go/jsiicalc/v3"
	"github.com/aws/jsii/jsii-calc/go/scopejsiicalclib"
)

func New(val jsii.Number) calc.Add {
	return calc.NewAdd(scopejsiicalclib.NewNumber(val), scopejsiicalclib.NewNumber(jsii.Number(10)))
}
