import * as ts from 'typescript';

const CAPTURED_ARGS_PROPERTY_NAME = 'capturedArgs';
const GET_CAPTURED_ARGS_METHOD_NAME = 'getConstructorArgs';

export class CaptureConstructorArgs {
  private process(
    node: ts.ClassDeclaration,
    capturedArgIdentifier: ts.Identifier,
  ): ts.ClassDeclaration {
    let updatedNode = this.addCapturedConstructorArgMember(
      node,
      capturedArgIdentifier,
    );
    updatedNode = this.updateConstructorWithCapturedArgs(
      updatedNode,
      capturedArgIdentifier,
    );
    return this.addGetCapturedConstructorArgsMethod(
      updatedNode,
      capturedArgIdentifier,
    );
  }

  /**
   * Return the set of Transformers to be used in TSC's program.emit()
   */
  public makeTransformers(): ts.CustomTransformers {
    return {
      before: [this.runtimeArgCaptureTransformer()],
    };
  }

  public runtimeArgCaptureTransformer(): ts.TransformerFactory<ts.SourceFile> {
    return (context) => {
      return (sourceFile) => {
        const visitor = (node: ts.Node): ts.Node => {
          if (ts.isClassDeclaration(node)) {
            const capturedArgIdentifier = ts.createUniqueName(
              CAPTURED_ARGS_PROPERTY_NAME,
            );
            return this.process(node, capturedArgIdentifier);
          }
          return ts.visitEachChild(node, visitor, context);
        };

        // Visit the source file, annotating the classes.
        const annotatedSourceFile = ts.visitNode(sourceFile, visitor);
        return annotatedSourceFile;
      };
    };
  }

  private addCapturedConstructorArgMember(
    node: ts.ClassDeclaration,
    capturedArgIdentifier: ts.Identifier,
  ) {
    const capturedMember = ts.createProperty(
      undefined,
      ts.createModifiersFromModifierFlags(
        ts.ModifierFlags.Private | ts.ModifierFlags.Readonly,
      ),
      capturedArgIdentifier,
      undefined,
      undefined,
      undefined,
    );
    return ts.updateClassDeclaration(
      node,
      node.decorators,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      [capturedMember, ...node.members],
    );
  }

  private updateConstructorWithCapturedArgs(
    node: ts.ClassDeclaration,
    capturedArgIdentifier: ts.Identifier,
  ) {
    const constructor: ts.ConstructorDeclaration =
      this.getConstructorDefinition(node);

    // Nothing to capture for a class which is missing constructor
    if (!constructor) {
      return node;
    }
    const parameters = constructor?.parameters;
    const parameterNames =
      parameters?.map((p) => {
        return (p.name as any).text;
      }) ?? [];

    const captureArgsInvocation = ts.createExpressionStatement(
      ts.createBinary(
        ts.createPropertyAccess(ts.createThis(), capturedArgIdentifier),
        ts.createToken(ts.SyntaxKind.EqualsToken),
        ts.createObjectLiteral(
          parameterNames.map((p) =>
            ts.createPropertyAssignment(
              ts.createIdentifier(p),
              ts.createIdentifier(p),
            ),
          ),
          false,
        ),
      ),
    );

    const body = constructor.body ?? ts.createBlock([], true);
    const statements = ts.updateBlock(body, [
      captureArgsInvocation,
      ...(constructor.body?.statements ?? []),
    ]);
    const updatedConstructor = ts.updateConstructor(
      constructor,
      constructor.decorators,
      constructor.modifiers,
      constructor.parameters,
      statements,
    );

    return ts.updateClassDeclaration(
      node,
      node.decorators,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      [updatedConstructor, ...node.members.filter((m) => m !== constructor)],
    );
  }

  private getConstructorDefinition(
    node: ts.ClassDeclaration,
  ): ts.ConstructorDeclaration {
    return node.members.find(
      (m) => m.kind === ts.SyntaxKind.Constructor,
    ) as ts.ConstructorDeclaration;
  }

  private addGetCapturedConstructorArgsMethod(
    node: ts.ClassDeclaration,
    capturedArgIdentifier: ts.Identifier,
  ) {
    const method = ts.createMethod(
      undefined,
      undefined,
      undefined,
      ts.createIdentifier(GET_CAPTURED_ARGS_METHOD_NAME),
      undefined,
      undefined,
      [],
      undefined,
      ts.createBlock(
        [
          ts.createIf(
            ts.createPropertyAccess(ts.createThis(), capturedArgIdentifier),
            ts.createBlock(
              [
                ts.createReturn(
                  ts.createPropertyAccess(
                    ts.createThis(),
                    capturedArgIdentifier,
                  ),
                ),
              ],
              true,
            ),
            undefined,
          ),
        ],
        true,
      ),
    );
    return ts.updateClassDeclaration(
      node,
      node.decorators,
      node.modifiers,
      node.name,
      node.typeParameters,
      node.heritageClauses,
      [method, ...node.members],
    );
  }
}
