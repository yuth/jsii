import * as spec from '@jsii/spec';

export function generateClassExample(type: spec.ClassType, types: {[fqn: string]: spec.Type }): string | undefined {
  let example = '';
  //if (!type.fqn.split('.')[1].startsWith('Cfn')) {
  if (type.abstract) {
    console.log(`${type.fqn} is an abstract class`);
  } else if (isStaticClass(type.properties)){
    console.log(`${type.fqn} is an enum-like class`);
  } else {
    console.log(`${type.fqn} could have example`);
    example += `new ${type.name}(this, My${type.name}, {\n`;
    example += buildExample(type, types, 1);
    example += '});';
  }
  // } else {
  //   console.log(type.fqn);
  // }
  return example;
}

function isStaticClass(properties: spec.Property[] | undefined): boolean {
  let once = false;
  for (const prop of properties ?? []){
    if (!prop.static) {
      if (once) {
        return false;
      }
      once = true;
    }
  }
  return true;
}

function buildExample(type: spec.Type, types: {[fqn: string]: spec.Type}, level: number): string {
  let example = '';
  if (spec.isClassType(type)) {
    for (const params of type.initializer?.parameters ?? []) {
      example += `${tabLevel(level)}${params.name}: ${addProp(params.type, params.name, types, level)},\n`;
    }
  } else if (spec.isEnumType(type)) {
    example += `${type.name}.${type.members[0].name},\n`;
  } else if (spec.isInterfaceType(type)) {
    for (const props of type.properties ?? []) {
      example += `\n${tabLevel(level)}${props.name}: ${addProp(props.type, props.name, types, level)},`;
    }
    example += `\n${tabLevel(level-1)}`;
  }
  return example;
}

function addProp(typeReference: spec.TypeReference, name: string, types: {[fqn: string]: spec.Type }, level: number): string {
  // Process primitive types, base case
  if (spec.isPrimitiveTypeReference(typeReference)) {
    switch ((typeReference as spec.PrimitiveTypeReference).primitive) {
      case spec.PrimitiveType.String: {
        return `'My-${name}'`;
      }
      case spec.PrimitiveType.Number: {
        return '0';
      }
      case spec.PrimitiveType.Boolean: {
        return 'false';
      }
      case spec.PrimitiveType.Any: {
        return '\'any-value\'';
      }
      default: {
        return '---';
      }
    }
  }

  // Just pick the first type if it is a union type
  if (spec.isUnionTypeReference(typeReference)) {
    console.log('union: ',name, typeReference);
    // TODO: which element should get picked?
    for (const newType of (typeReference as spec.UnionTypeReference).union.types) {
      // Ignore named types first if possible
      if (!spec.isNamedTypeReference(newType)) {
        return addProp(newType, name, types, level);
      }
    }
    const newType = (typeReference as spec.UnionTypeReference).union.types[0];
    return addProp(newType, name, types, level);
  }

  // If its a collection create a collection of one element
  if (spec.isCollectionTypeReference(typeReference)) {
    console.log('collectioN: ',name, typeReference);
    const collection = (typeReference as spec.CollectionTypeReference).collection;
    if (collection.kind === spec.CollectionKind.Array) {
      return `[${addProp(collection.elementtype,name, types, level+1)}]`;
    } else {
      return `{${addProp(collection.elementtype,name, types, level+1)}}`;
    }
  }

  // Process objects recursively
  if (spec.isNamedTypeReference(typeReference)) {
    console.log('named: ',name, typeReference);
    const fqn = (typeReference as spec.NamedTypeReference).fqn;
    // See if we have information on this type in the assembly
    const nextType = types[fqn];
    console.log('nextType: ', nextType?.fqn, typeReference.fqn);
    return `{${buildExample(nextType, types, level+1)}}`;
  }

  return 'OH NO';
}

function tabLevel(level: number): string {
  return '\t'.repeat(level);
}