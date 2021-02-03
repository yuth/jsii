package software.amazon.jsii;

import org.jetbrains.annotations.Nullable;

import java.lang.ref.Reference;
import java.lang.ref.ReferenceQueue;
import java.lang.ref.WeakReference;
import java.util.HashMap;
import java.util.HashSet;
import java.util.Map;
import java.util.Set;

@Internal
final class ObjectStore {
    private final Map<String, ObjectHandle> objectsById = new HashMap<>();
    private final ReferenceQueue<Object> referenceQueue = new ReferenceQueue<>();
    private final Map<Reference<?>, String> referenceInstanceId = new HashMap<>();

    ObjectStore() {}

    public Set<String> getDroppedReferences() {
        final Set<String> result = new HashSet<>();
        for (Reference<?> ref = referenceQueue.poll(); ref != null ; ref = referenceQueue.poll()) {
            final String instanceId = referenceInstanceId.remove(ref);
            if (instanceId != null) {
                result.add(instanceId);
                objectsById.remove(instanceId);
            }
        }
        return result;
    }

    public void register(final Object object, final String instanceId) {
        if (this.objectsById.containsKey(instanceId)) {
            // (Re-)Registration implies retaining.
            this.objectsById.get(instanceId).retain();
            return;
        }

        final ObjectHandle handle = new ObjectHandle(object, instanceId, this.referenceQueue);
        this.referenceInstanceId.put(handle.getReference(), instanceId);
        this.objectsById.put(instanceId, handle);
    }

    @Nullable
    public Object getObject(final String instanceId) {
        final ObjectHandle handle = this.objectsById.get(instanceId);
        return handle != null ? handle.getReferent() : null;
    }

    /**
     * Removes the strong reference that may exist on the object backing the
     * provided instance ID. This should be called when the node process
     * notifies the object was released.
     *
     * @param instanceId the ID of the instance to release.
     */
    public void release(final String instanceId) {
        this.objectsById.get(instanceId).release();
    }

    /**
     * Ensures a strong reference exists for the object that backs the provided
     * instance ID. This should be called each time a reference is carried over
     * to the node process, as a way to ensure the node reference is accounted
     * for correctly.
     *
     * @param instanceId the ID of the instance to retain.
     */
    public void retain(final String instanceId) {
        this.objectsById.get(instanceId).retain();
    }

    private static final class ObjectHandle {
        private final String instanceId;
        private final WeakReference<Object> weakReference;
        @Nullable
        private Object strongReference;

        public ObjectHandle(
                final Object referent,
                final String instanceId,
                final ReferenceQueue<Object> referenceQueue) {
            this.instanceId = instanceId;
            this.strongReference = referent;
            this.weakReference = new WeakReference<>(referent, referenceQueue);
        }

        @Nullable
        public Object getReferent() {
            return this.strongReference != null
                    ? this.strongReference
                    : this.weakReference.get();
        }

        public Reference<?> getReference() {
            return this.weakReference;
        }

        public String getInstanceId() {
            return instanceId;
        }

        public void release() {
            this.strongReference = null;
        }

        public void retain() {
            this.strongReference = this.weakReference.get();
            if (this.strongReference == null) {
                throw new IllegalStateException("Referent object was already reclaimed!");
            }
        }
    }
}
