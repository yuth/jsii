import { Type } from '@jsii/spec';

import { AnnotatedObjRef, TOKEN_INTERFACES, TOKEN_REF } from '../api';
import { InterfaceCollection } from '../interface-collection';
import { Sequence } from './sequence';

/* eslint-disable @typescript-eslint/ban-types */

/**
 * The referent object to an ObjectHandle.
 */
export type ReferentObject = { [key: string]: unknown };

/**
 * A registered handle to some object instance.
 */
export class ObjectHandle<T extends ReferentObject = ReferentObject> {
  /**
   * The fully qualified class name this object is an instance of.
   */
  public readonly classFQN: string;
  /**
   * The instance ID assigned to this object handle.
   */
  public readonly instanceId: string;

  /** The weak reference to the object handle. */
  private readonly weakRef: WeakRef<T>;
  /** The list of interfaces declared on this object. */
  private readonly declaredInterfaces: Set<string>;
  /** The collection of interfaces indirectly implemented by this object. */
  private readonly providedInterfaces: InterfaceCollection;

  /** An optional strong reference to the object. */
  private strongRef?: T;

  /**
   * Creates a new `ObjectHandle`.
   *
   * @param opts the necessary information to create the `ObjectHandle`.
   */
  public constructor(opts: ObjectHandleOptions<T>) {
    this.classFQN = opts.classFQN;
    this.instanceId = `${opts.classFQN}@${opts.sequence.next()}`;
    this.weakRef = new WeakRef(opts.instance);

    this.declaredInterfaces = new Set(opts.interfaceFQNs);
    this.providedInterfaces = new InterfaceCollection(
      opts.resolveType,
      opts.classFQN,
    );
    for (const fqn of this.declaredInterfaces) {
      this.providedInterfaces.addFromInterface(fqn);
    }
    for (const fqn of this.providedInterfaces) {
      this.declaredInterfaces.delete(fqn);
    }
  }

  /**
   * The list of interfaces directly implemented by this object.
   */
  public get interfaces(): readonly string[] {
    return Array.from(this.declaredInterfaces).sort();
  }

  /**
   * @returns `true` if this `ObjectHandle` is retained, meaning it holds a
   *          strong reference to it's referent value.
   */
  public get isRetained(): boolean {
    return this.strongRef != null;
  }

  /**
   * @returns the `AnnotatedObjectRef` for this instance.
   */
  public get objRef(): AnnotatedObjRef {
    const interfaces = this.interfaces;
    return {
      [TOKEN_INTERFACES]: interfaces.length > 0 ? interfaces : undefined,
      [TOKEN_REF]: this.instanceId,
    };
  }

  /**
   * Invokes the provided function with the referent to this `ObjectHandle`
   *
   * @param cb the function to be invoked with the referent object.
   *
   * @throws if the referent object has been garbage-collected already.
   */
  public ensureAlive<R>(cb: (obj: T) => R): R {
    const obj = this.strongRef ?? this.weakRef.deref();
    if (obj == null) {
      throw new Error(
        `Referent object for ${this.instanceId} has been garbage collected!`,
      );
    }
    return cb(obj);
  }

  /**
   * Merges the provided interfaces into this `ObjectHandle`'s declared
   * interfaces, removing any redundant declarations.
   *
   * @param interfaceFQNs the list of interfaces to merge in.
   */
  public mergeInterfaces(interfaceFQNs: readonly string[]): void {
    if (interfaceFQNs.length === 0) {
      return;
    }

    for (const fqn of interfaceFQNs) {
      this.providedInterfaces.addFromInterface(fqn);
      this.declaredInterfaces.add(fqn);
    }

    for (const fqn of this.providedInterfaces) {
      this.declaredInterfaces.delete(fqn);
    }
  }

  /**
   * Creates a strong reference to the referent of this `ObjectHandle`. This
   * will only succeed if the objct has not been garbage collected yet.
   *
   * @returns `true` if the strong reference could be created.
   */
  public retain(): boolean {
    this.strongRef = this.weakRef.deref();
    return this.strongRef != null;
  }

  /**
   * Removes the strong reference from this `ObjectHandle`, possibly allowing
   * it's referent to be garbage-collected.
   */
  public release() {
    this.strongRef = undefined;
  }
}

/**
 * Options for creating a new `ObjectHandle`.
 */
export interface ObjectHandleOptions<T extends object> {
  /**
   * The fully qualified type name for this object. Might be `Object` if the
   * instance is of an "anonymous" type.
   */
  readonly classFQN: string;

  /**
   * The instance (might be a proxy to a foreign-owned object, according to the
   * value of the `owner` property) that is tracked.
   */
  readonly instance: T;

  /**
   * The fully qualified type name for interfaces this object implements. It is
   * not necessary for the value to specify transitively implemented interfaces,
   * whether they are inherited from the class referred to by `classFQN`, or by
   * another entry in the `interfaceFQNs` list.
   */
  readonly interfaceFQNs: readonly string[];

  /**
   * A function that can resolve a jsii type given it's fully qualified name.
   */
  readonly resolveType: (fqn: string) => Type;

  /**
   * The sequence to sue when generating instance IDs.
   */
  readonly sequence: Sequence;
}
