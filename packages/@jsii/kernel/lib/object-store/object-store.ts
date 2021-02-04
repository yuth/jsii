import { Type } from '@jsii/spec';
import * as assert from 'assert';
import { EventEmitter } from 'events';

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
export class ObjectStore implements TypedEventEmitter<ObjectStoreEvents> {
  private readonly typeInfo = Symbol('__jsii::FQN__');

  private readonly idSequence = new Sequence();

  private readonly handles = new Map<string, ObjectHandle>();
  private readonly instanceInfo = new WeakMap<object, ObjectHandle>();

  private readonly finalizationRegistry = new FinalizationRegistry(
    this.onProxyFinalized.bind(this),
  );
  private readonly finalized = new Set<string>();

  private readonly eventEmitter: TypedEventEmitter<ObjectStoreEvents> = new EventEmitter();
  public readonly emit = this.eventEmitter.emit.bind(this.eventEmitter);
  public readonly on = this.eventEmitter.on.bind(this.eventEmitter);
  public readonly once = this.eventEmitter.once.bind(this.eventEmitter);

  /**
   * @returns The approximate number of object instances this `ObjectStore`
   *          currently strong references.
   */
  public readonly stats = new ObjectStoreStats(this.handles);

  /**
   * Creates a new `ObjectStore` with the provided values.
   *
   * @param resolveType         a function to resolve a jsii type from it's FQN.
   * @param instanceIdSeed      the initial instance ID in the sequence.
   * @param instanceIdIncrement the increment between instance IDs.
   */
  public constructor(private readonly resolveType: (fqn: string) => Type) {}

  /**
   * Removes the object designated by the provided `ObjRef` from this
   * `ObjectStore`.
   *
   * @param ref the `ObjRef` which should be deleted.
   */
  public delete(ref: ObjRef): void {
    const instanceId = ref[TOKEN_REF];

    // It is illegal to delete an object that is still user-reachable!
    assert(
      !this.handles.get(instanceId)?.hasProxy,
      `Attempted to delete user-reachable object: ${instanceId}`,
    );

    if (this.handles.delete(instanceId)) {
      this.emit('unmanaged', instanceId, this.stats);
    }
  }

  /**
   * Dereferences the provided `ObjectRef`.
   *
   * @param ref the `ObjectRef` to dereference.
   *
   * @returns the referent object and it's meta-information.
   */
  public dereference(
    ref: ObjRef,
  ): {
    readonly classFQN: string;
    readonly instance: ReferentObject;
    readonly interfaces: readonly string[];
  } {
    const handle = this.getHandle(ref[TOKEN_REF]);
    return {
      classFQN: handle.classFQN,
      instance: handle.proxy,
      interfaces: handle.interfaces,
    };
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
   * reported to other process as no longer in-use by this process, so their
   * counterparts there can be garbage collected.
   *
   * In particular, this signals other processes can request those instances be
   * `delete`d from this `ObjectStore`.
   */
  public finalizedInstanceIds(): readonly string[] {
    try {
      return (
        Array.from(this.finalized)
          // Verify no new proxy was created since the instance ID was enqueued
          .filter((iid) => !this.handles.get(iid)?.hasProxy)
      );
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
    const handle: ObjectHandle<T> =
      (existingHandle as any) ??
      new ObjectHandle<T>(this, {
        ...opts,
        finalizationRegistry: this.finalizationRegistry,
        resolveType: this.resolveType,
        sequence: this.idSequence,
      });

    if (existingHandle == null) {
      this.handles.set(handle.instanceId, handle);
      this.instanceInfo.set(opts.instance, handle);
    } else {
      existingHandle.mergeInterfaces(opts.interfaceFQNs);
    }

    return { instance: handle.proxy, objRef: handle.objRef };
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
   * Retrieves the FQN associated to a given value.
   *
   * @param value the value which type's FQN is needed.
   *
   * @returns the FQN associated to the type of `value`, if any.
   */
  public typeFQN(value: object): string | undefined {
    return (value.constructor as any)[this.typeInfo];
  }

  private getHandle(instanceId: string): ObjectHandle {
    const handle = this.handles.get(instanceId);
    if (handle == null) {
      throw new Error(
        `Could not find handle registered with ID: ${instanceId}`,
      );
    }
    return handle;
  }

  private onProxyFinalized(handle: ObjectHandle): void {
    // Note - for some reason, you won't get a breakpoint to hit here, probably
    // because this gets invoked by the `FinalizationRegistry` out of the normal
    // flow of operations of the agent.
    this.finalized.add(handle.instanceId);

    this.emit('releasable', handle.instanceId, this.stats);
  }

  private tryGetHandle(instance: object): ObjectHandle | undefined {
    return this.instanceInfo.get(ObjectHandle.realObject(instance));
  }
}

/**
 * Statistics collected about an `ObjectStore`.
 */
export class ObjectStoreStats {
  /**
   * @internal
   */
  public constructor(private readonly objectStore: ObjectStore['handles']) {}

  /**
   * The count of objects tracked by an `ObjectStore`.
   */
  public get managedObjects(): number {
    return this.objectStore.size;
  }

  /**
   * The count of objects retained by an `ObjectStore`. These objects are not
   * eligible for deletion.
   */
  public get retainedObjects(): number {
    return (
      Array.from(this.objectStore.values())
        // Retained objects are those for which a live proxy exists
        .filter((handle) => handle.hasProxy).length
    );
  }
}

export type ObjectStoreEvents = {
  /**
   * Emitted when a new object starts being managed by this `ObjectStore`.
   *
   * @param instanceId the instance ID allocated to this object.
   * @param stats      statistics from the `ObjectStore` that emitted this
   *                   event.
   */
  managed(instanceId: string, stats: ObjectStoreStats): void;

  /**
   * Emitted when a user-accessible reference for the object is created, when
   * none previously existed.
   *
   * @param instanceId the instance ID of the object that is now
   *                   user-accessible.
   */
  retained(instanceId: string, stats: ObjectStoreStats): void;

  /**
   * Emitted after the last user-accessible reference to an ojbect has been
   * reclaimed by the garbage collector.
   *
   * @param instanceId the instance ID of the object that is no longer
   *                   user-accessible.
   * @param stats      statistics from the `ObjectStore` that emitted this
   *                   event.
   */
  releasable(instanceId: string, stats: ObjectStoreStats): void;

  /**
   * Emitted after an object has stopped being managed by this `ObjectStore`.
   *
   * @param instanceId the former instance ID of the object that is no longer
   *                   managed.
   * @param stats      statistics from the `ObjectStore` that emitted this
   *                   event.
   */
  unmanaged(instanceId: string, stats: ObjectStoreStats): void;
};

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
   * The managed object instance. This value should be used in place of the one
   * that was passed to `ObjectStore#register`, as otherwise, reference counting
   * might not be performed correctly.
   */
  readonly instance: T;

  /**
   * The object reference that was assigned to this object instance.
   */
  readonly objRef: ObjRef;
}

/**
 * A nifty way to create type-safe EventEmitter interfaces without having to
 * repeat the interfaces for emit, on, once, ...
 */
export type TypedEventEmitter<
  Events extends Record<string | symbol, (...args: any[]) => void>
> = {
  emit<K extends keyof Events>(
    event: K,
    ...payload: Parameters<Events[K]>
  ): boolean;

  on<K extends keyof Events>(event: K, listener: Events[K]): void;
  once<K extends keyof Events>(event: K, listener: Events[K]): void;
};
