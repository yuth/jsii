import { Type } from '@jsii/spec';
import * as assert from 'assert';
import { inspect } from 'util';

import { ObjRef, TOKEN_REF } from '../api';
import { ObjectHandle, ReferentObject } from './object-handle';
import { Sequence } from './sequence';

/* eslint-disable @typescript-eslint/ban-types */

/**
 * An instance of this class is used by the `Kernel` class to associate object
 * instances to instance IDs, which are then used when exchanging information
 * across the process boundary.
 *
 * This class encapsualtes the necessary logic to determine when registered
 * objects should be made eligible to garbage collection, and provides a list of
 * instance IDs that have been garbage collected so that this information can be
 * pushed to other processes.
 *
 * Note that the `FinalizationRegistry` will only ever trigger when the job that
 * created an instance completes, meaning a new "root" run-loop run begins. This
 * makes it difficult to test actual collection in unit tests (as we do not
 * control the current job).
 */
export class ObjectStore {
  private readonly typeInfo = Symbol('__jsii::FQN__');

  private readonly idSequence = new Sequence();

  private readonly handles = new Map<string, ObjectHandle>();
  private readonly instanceInfo = new WeakMap<object, ObjectHandle>();

  private readonly finalizationRegistry = new FinalizationRegistry(
    this.finalize.bind(this),
  );
  private readonly finalized = new Set<string>();

  /**
   * Creates a new `ObjectStore` with the provided values.
   *
   * @param resolveType         a function to resolve a jsii type from it's FQN.
   * @param instanceIdSeed      the initial instance ID in the sequence.
   * @param instanceIdIncrement the increment between instance IDs.
   */
  public constructor(private readonly resolveType: (fqn: string) => Type) {}

  /**
   * @returns The approximate number of object instances this `ObjectStore`
   *          currently strong references.
   */
  public get retainedObjectCount(): number {
    return Array.from(this.handles.values()).filter(
      (handle) => handle.isRetained,
    ).length;
  }

  /**
   * Dereferences the provided `ObjectRef`.
   *
   * @param ref the `ObjectRef` to dereference.
   *
   * @returns the referent object and it's meta-information.
   */
  public derefObject(
    ref: ObjRef,
  ): {
    readonly classFQN: string;
    readonly instance: ReferentObject;
    readonly interfaces: readonly string[];
  } {
    const handle = this.derefObjectHandle(ref);
    return handle.ensureAlive((instance) => ({
      classFQN: handle.classFQN,
      instance,
      interfaces: handle.interfaces,
    }));
  }

  /**
   * Attempts to retrieve an existing `ObjRef` for the provided object.
   *
   * @param obj the object for which an existing `ObjRef` is needed.
   *
   * @returns the existing `ObjRef` bound to this object, if one exists.
   */
  public refObject(obj: ReferentObject): ObjRef | undefined {
    return this.tryGetHandle(obj)?.objRef;
  }

  /**
   * Obtains (then flushes) the list of finalized instance IDs. Those can be
   * reported to other process as no longer in-use, so their counterparts there
   * can be garbage collected.
   */
  public finalizedInstanceIds(): readonly string[] {
    try {
      return Array.from(this.finalized);
    } finally {
      this.finalized.clear();
    }
  }

  /**
   * Registers a new object in this object store. The provided instance will be
   * retained upon registration. The caller does not need to explicitly call
   * `ObjectStore#retain`.
   *
   * @param opts information about the registered object.
   *
   * @returns the managed object.
   */
  public register<T extends ReferentObject>(
    opts: RegisterOptions<T>,
  ): ManagedObject<T> {
    if (opts.instance == null) {
      throw new TypeError('Attempted to register "null" object!');
    }

    const existingHandle = this.tryGetHandle(opts.instance);
    const handle =
      existingHandle ??
      new ObjectHandle<T>({
        ...opts,
        resolveType: this.resolveType,
        sequence: this.idSequence,
      });

    if (existingHandle == null) {
      this.handles.set(handle.instanceId, handle);
      this.instanceInfo.set(opts.instance, handle);
      this.finalizationRegistry.register(opts.instance, handle.instanceId);
    } else {
      existingHandle.mergeInterfaces(opts.interfaceFQNs);
    }

    // The assertion should never fail unless something really weird has
    // happened, since the instance we are trying to retain here has been
    // provided as an argument to this call (and is hence reachable).
    assert(handle.retain(), `Could not retain handle ${handle.instanceId}`);

    return { instance: opts.instance, objRef: handle.objRef };
  }

  /**
   * Associates a constructor with a jsii type fully qualified name.
   *
   * @param type the type (constructor or enum object) being registered.
   * @param fqn  the jsii fully qualified name for this constructor.
   */
  public registerType(type: object, fqn: string): void {
    Object.defineProperty(type, this.typeInfo, {
      configurable: false,
      enumerable: false,
      value: fqn,
      writable: false,
    });
  }

  /**
   * Adds a strong reference to the provided object.
   *
   * @param obj    the object to be strongly referenced.
   */
  public retain<T extends object>(obj: T) {
    const handle = this.instanceInfo.get(obj);
    if (handle == null) {
      throw new Error(
        `Attempted to retain unregistered object: ${inspect(obj)}`,
      );
    }
    // This assertion is out of an excess of precaution: the object cannot have
    // been garbage-collected yet, since it was provided to us via a parameter.
    // If an `AssertionError` triggers, there likely was some form of
    // corruption happening.
    assert(handle.retain(), `Could not retain object ${inspect(obj)}!`);
  }

  /**
   * Removes the strong reference held on the designated object.
   *
   * @param obj    the object on which a reference is to be dropped.
   */
  public release<T extends object>(obj: T) {
    const handle = this.instanceInfo.get(obj);
    if (handle == null) {
      throw new Error(
        `Attempted to release unregistered object: ${inspect(obj)}`,
      );
    }
    handle.release();
  }

  /**
   * Removes the strong reference held on the object designated by the provided
   * `ObjRef`.
   *
   * @param ref the `ObjRef` which should be released.
   */
  public releaseRef(ref: ObjRef): void {
    this.derefObjectHandle(ref).release();
  }

  /**
   * Retrieves the FQN associated to a given value.
   *
   * @param value the value which type's FQN is needed.
   *
   * @returns the FQN associated to the type of `value`, if any.
   */
  public typeFQN(value: object): string | undefined {
    return (value.constructor as any)[this.typeInfo];
  }

  private finalize(instanceId: string): void {
    this.finalized.add(instanceId);
    this.handles.delete(instanceId);
  }

  private tryGetHandle(instance: any): ObjectHandle | undefined {
    return this.instanceInfo.get(instance);
  }

  private derefObjectHandle(ref: ObjRef): ObjectHandle {
    const handle = this.handles.get(ref[TOKEN_REF]);
    if (handle == null) {
      throw new Error(
        `Could not find handle registered with ID: ${ref[TOKEN_REF]}`,
      );
    }
    return handle;
  }
}

/**
 * An object to be tracked by this facility.
 */
export interface RegisterOptions<T extends object> {
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
}

export interface ManagedObject<T> {
  /**
   * The managed object instance. This is guaranteed to be the same instance
   * that was provided to the `ObjectStore#register` call.
   */
  readonly instance: T;

  /**
   * The object reference that was assigned to this object instance.
   */
  readonly objRef: ObjRef;
}
