#include "eye.h"
#include "tm4/main/os.h"
#include <stdlib.h>
#include <string.h>

void Tm3EgyptClassConstructor(RegistryDirectory* directory)
{
    if (!Tm3EyeRegister()) {
        abort();
    }
}

__attribute__((visibility("default"))) OSWord Tm4ModuleExport(const char* name)
{
    if (!strcmp(name, "Tm3UseEye"))
        return (OSWord)Tm3UseEye;
    if (!strcmp(name, "Tm3EgyptClassConstructor"))
        return (OSWord)Tm3EgyptClassConstructor;
    if (!strcmp(name, "__rm4_snapshot_types"))
        return (OSWord)Tm3EyeSnapshots;
    return 0;
}
