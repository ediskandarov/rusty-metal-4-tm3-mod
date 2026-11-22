#include "turbo.h"
#include "port/extensions/turbo.h"
#include "port/web/module_import.h"
#include "tm3/resources.h"
#include "tm4/main/object.h"
#include "tm4/main/sound.h"
#include <stdio.h>
#include <string.h>

static int integer(RegistryDirectory* profile, char* name, s32* output, s32 min, s32 max)
{
    RegistryFile* file = RegGetFilePtrPS(profile, name);
    if (!file || RegGetFileTypeP(file) != REG_FILE_TYPE_LONG
        || RegGetFileByteSizeP(file) != sizeof(*output) || RegGetFileArraySizeP(file) != 1)
        return 0;
    *output = *(s32*)RegGetFileDataP(file);
    return *output >= min && *output <= max;
}

static s32 construct(Tm3Turbo* turbo, va_list args)
{
    const Rm4TurboAppearanceContext* context = va_arg(args, const Rm4TurboAppearanceContext*);
    memset(turbo, 0, sizeof(*turbo));
    if (!context || !ObjectGetHeader(turbo)->owner)
        return 0;
    turbo->position = context->position;
    RegistryDirectory* profile = context->profile;
    if (!integer(profile, "sprite", &turbo->sprite, 0, 5)
        || !integer(profile, "size", &turbo->size, 1, 4096)
        || !integer(profile, "fps", &turbo->fps, 1, 30))
        return 0;
    if (RegGetDirectoryPtrPS(profile, "sound"))
        return 0;
    RegistryFile* file = RegGetFilePtrPS(profile, "sound");
    if (file) {
        u32 size = RegGetFileByteSizeP(file);
        const char* name = RegGetFileDataP(file);
        if (RegGetFileTypeP(file) != REG_FILE_TYPE_STRING || size < 2 || size > sizeof(turbo->sound)
            || !name || !name[0] || name[size - 1] || !SoundIsLooping((char*)name))
            return 0;
        memcpy(turbo->sound, name, strlen(name) + 1);
    }
    return 1;
}

int Tm3TurboValidate(const void* object)
{
    const Tm3Turbo* turbo = object;
    return turbo->sprite >= 0 && turbo->sprite < 6 && turbo->size > 0 && turbo->size <= 4096
        && turbo->fps > 0 && turbo->fps <= 30 && !turbo->sound[sizeof(turbo->sound) - 1]
        && (!turbo->sound[0] || SoundIsLooping((char*)turbo->sound));
}

static void process(Tm3Turbo* turbo)
{
    Car* car = ObjectGetHeader(turbo)->owner;
    SVECTOR position;
    WEB_MODULE("car", CarLocalPosToWorldPos)(car, &turbo->position, &position);
    ObjectSetPosition(turbo, position.vx, position.vy, position.vz);
    if (!car->turbo_thrust_applied) {
        if (turbo->loop) {
            WEB_MODULE("sound", SoundEmitterSetVolumeFade)(turbo->loop, 1024);
            turbo->loop = NULL;
        }
        return;
    }
    Tm3SpawnSprite(turbo->sprite, &position, turbo->size, NULL, turbo->fps, -2);
    if (turbo->sound[0] && !turbo->loop)
        turbo->loop = ObjectCreate("soundEmitter",
            OBJECT_HAS_OWNER | OBJECT_DESTROY_WITH_OWNER | OBJECT_FOLLOW_OWNER, turbo, turbo->sound,
            0);
}

int Tm3TurboRegister(RegistryDirectory* directory)
{
    return ObjectRegisterClass("tm3Turbo", sizeof(Tm3Turbo), directory,
        (Tm4PackedConstructor)construct, NULL, (Tm4ObjectCallback)process, NULL, NULL);
}

const SnapshotField Tm3TurboFields[] = {
    SNAP_POD(Tm3Turbo, position.vx),
    SNAP_POD(Tm3Turbo, position.vy),
    SNAP_POD(Tm3Turbo, position.vz),
    SNAP_POD(Tm3Turbo, sprite),
    SNAP_POD(Tm3Turbo, size),
    SNAP_POD(Tm3Turbo, fps),
    SNAP_POD(Tm3Turbo, sound),
    SNAP_WEAK_REF(Tm3Turbo, loop, "soundEmitter"),
    { 0 },
};
