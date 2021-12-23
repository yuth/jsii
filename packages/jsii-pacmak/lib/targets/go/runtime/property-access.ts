import { CodeMaker } from 'codemaker';

import { GoProperty } from '../types';
import {
  JSII_GET_FUNC,
  JSII_SET_FUNC,
  JSII_SGET_FUNC,
  JSII_SSET_FUNC,
} from './constants';
import { FunctionCall } from './function-call';
import { emitInitialization } from './util';

export class GetProperty extends FunctionCall {
  public constructor(public readonly parent: GoProperty) {
    super(parent);
  }

  public emit(code: CodeMaker) {
    code.open(`return ${JSII_GET_FUNC}[${this.returnType}](`);
    code.line(`${this.parent.instanceArg},`);
    code.line(`"${this.parent.property.name}",`);
    code.close(`)`);
  }
}

export class SetProperty {
  public constructor(public readonly parent: GoProperty) {}

  public emit(code: CodeMaker) {
    code.open(`${JSII_SET_FUNC}(`);
    code.line(`${this.parent.instanceArg},`);
    code.line(`"${this.parent.property.name}",`);
    code.line(`val,`);
    code.close(`)`);
  }
}

export class StaticGetProperty extends FunctionCall {
  public constructor(public readonly parent: GoProperty) {
    super(parent);
  }

  public emit(code: CodeMaker) {
    emitInitialization(code);

    code.open(`return ${JSII_SGET_FUNC}[${this.returnType}](`);
    code.line(`"${this.parent.parent.fqn}",`);
    code.line(`"${this.parent.property.name}",`);
    code.close(`)`);
  }
}

export class StaticSetProperty {
  public constructor(public readonly parent: GoProperty) {}

  public emit(code: CodeMaker) {
    emitInitialization(code);

    code.open(`${JSII_SSET_FUNC}(`);
    code.line(`"${this.parent.parent.fqn}",`);
    code.line(`"${this.parent.property.name}",`);
    code.line(`val,`);
    code.close(`)`);
  }
}
