package software.amazon.jsii.api;

import org.jetbrains.annotations.Nullable;
import software.amazon.jsii.Internal;

import java.util.Set;

@Internal
public final class Notification {
    @Nullable
    private Set<String> release;

    @Nullable
    public Set<String> getRelease() {
        return this.release;
    }

    public void setRelease(@Nullable final Set<String> value) {
        this.release = value;
    }
}
