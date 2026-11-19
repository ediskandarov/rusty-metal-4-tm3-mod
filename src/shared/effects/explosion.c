#include "assets.h"
#include "audio.h"
#include "effects/private.h"
#include "module_import.h"
#include "tm4/main/math3d.h"

#include <STDARG.H>

static char explosion_class[] = "tm3Explosion";

static void add_force(Car* car, const VECTOR* force)
{
    for (CarParticle* p = car->particles; p < car->particle_end; ++p) {
        p->external_force.vx += force->vx;
        p->external_force.vy += force->vy;
        p->external_force.vz += force->vz;
    }
}
static s32 explosion_constructor(Tm3Explosion* explosion, va_list arguments)
{
    const Tm3ExplosionSettings* settings = va_arg(arguments, const Tm3ExplosionSettings*);
    memset(explosion, 0, sizeof(*explosion));
    MATRIX frame;
    if (settings->rotation)
        memcpy(explosion->rotation, settings->rotation->m, sizeof(explosion->rotation));
    else {
        RotationMatrixY(0, &frame);
        memcpy(explosion->rotation, frame.m, sizeof(explosion->rotation));
    }
    memcpy(explosion->step, settings->step, sizeof(explosion->step));
    explosion->material_offset = UINT32_MAX;
    if (settings->material != Tm3Untextured) {
        u32 offset = 0x50;
        if (settings->material == Tm3AxelMaterial)
            offset = 0x1f0;
        if (settings->material == Tm3RemoteMaterial)
            offset = 0x258;
        explosion->material_offset = Tm3ReadU32(Tm3WeaponData + offset);
        if (explosion->material_offset > Tm3WeaponMesh.material_bytes
            || Tm3WeaponMesh.material_bytes - explosion->material_offset
                < sizeof(Tm4CardQuadTexture))
            return 0;
    }
    explosion->height = settings->height < 8 ? 8 : settings->height;
    explosion->inner_ratio_q12 = settings->inner_ratio_q12 < 0 ? 0 : settings->inner_ratio_q12;
    explosion->speed = settings->speed < 32 ? 32 : settings->speed;
    explosion->duration = settings->duration < 1 ? 1 : settings->duration;
    explosion->radial_force = settings->radial_force;
    explosion->lift = settings->lift;
    explosion->affects_owner = settings->affects_owner;
    explosion->once_per_car = settings->once_per_car;
    explosion->slow_speed = explosion->speed / 4 < 16 ? 16 : explosion->speed / 4;
    explosion->damage = (settings->radial_force + settings->lift) / 4;
    explosion->color = settings->color;
    for (s32 shift = 0; shift < 24; shift += 8)
        explosion->color_step |= (((settings->color >> shift) & 255) / explosion->duration)
            << shift;
    set_position(explosion, &settings->position);
    ObjectSetInteractionRadius(explosion, 1);
    Tm3PlaySound(26, &settings->position, 1200, 1);
    return 1;
}
static void explosion_process(Tm3Explosion* explosion)
{
    explosion->color -= explosion->color_step;
    ++explosion->age;
    explosion->radius
        += explosion->age < explosion->duration / 4 ? explosion->speed : explosion->slow_speed;
    if (explosion->step[0] || explosion->step[1] || explosion->step[2]) {
        const Tm4ShortVectorXYZ* p = &ObjectGetHeader(explosion)->position;
        ObjectSetPosition(explosion, (s16)(p->vx + explosion->step[0]),
            (s16)(p->vy + explosion->step[1]), (s16)(p->vz + explosion->step[2]));
    }
    ObjectSetInteractionRadius(explosion, explosion->radius);
    if (explosion->age > explosion->duration)
        ObjectDestroy(explosion);
}
static s32 falloff(s32 value, s32 distance)
{
    return value - value * distance / 2048;
}
static void explosion_car(void* first, void* second)
{
    Car* car = first;
    Tm3Explosion* explosion = second;
    Car* owner = ObjectGetHeader(explosion)->owner;
    if (!explosion->affects_owner && car == owner)
        return;
    s32 serial = ObjectGetHeader(car)->serial;
    if (explosion->once_per_car) {
        s32 slot = -1;
        for (s32 i = 0; i < 16; ++i) {
            if (explosion->hit_serials[i] == serial)
                return;
            if (!explosion->hit_serials[i])
                slot = i;
        }
        if (slot < 0)
            return;
        explosion->hit_serials[slot] = serial;
    }
    const Tm4ShortVectorXYZ *origin = &ObjectGetHeader(explosion)->position,
                            *p = &ObjectGetHeader(car)->position;
    int32_t delta[3] = { p->vx - origin->vx, p->vy - origin->vy, p->vz - origin->vz };
    int16_t normal[3];
    u32 square = 0;
    for (s32 axis = 0; axis < 3; ++axis) {
        s32 component = (s16)delta[axis];
        square += (u32)(component * component);
    }
    s32 distance = SquareRoot0(square);
    Tm3ProjectileNormalize(delta, normal);
    VECTOR force;
    s32 radial = falloff(explosion->radial_force, distance);
    force.vx = radial * normal[0];
    force.vy = radial * normal[1] - falloff(explosion->lift, distance) * 4096;
    force.vz = radial * normal[2];
    add_force(car, &force);
    WEB_MODULE("car", CarApplyParticipantDamage)
    (car, owner, ObjectGetHeader(explosion)->participant, falloff(explosion->damage, distance),
        NULL, NULL);
}
static void explosion_display(
    Tm3Explosion* explosion, Tm4OrderingTag* ordering, u8** cursor, u8* limit, MATRIX* view)
{
    const u8* materials = Tm3WeaponMesh.materials;
    Tm4CardQuadTexture texture;
    long colors[4] = { explosion->color, explosion->color, explosion->color, explosion->color };
    if (explosion->material_offset != UINT32_MAX)
        Tm3CopyTexture(&texture, materials + explosion->material_offset);
    MATRIX transform = { 0 }, camera;
    memcpy(transform.m, explosion->rotation, sizeof(transform.m));
    const Tm4ShortVectorXYZ* p = &ObjectGetHeader(explosion)->position;
    transform.t[0] = p->vx;
    transform.t[1] = p->vy;
    transform.t[2] = p->vz;
    CompMatrix(view, &transform, &camera);
    PushMatrix();
    SetRotMatrix(&camera);
    SetTransMatrix(&camera);
    s32 outer = explosion->radius, inner = q12(outer * explosion->inner_ratio_q12);
    MATRIX rotation;
    RotationMatrixY(0, &rotation);
    SVECTOR previous_outer = { outer, 0, 0, 0 },
            previous_inner = { inner, -explosion->height, 0, 0 };
    for (s32 i = 1; i <= 32; ++i) {
        RotationMatrixY((i * 128) & 4095, &rotation);
        s32 cosine = rotation.m[0][0], sine = rotation.m[0][2];
        SVECTOR next_outer = { q12(outer * cosine), 0, q12(-outer * sine), 0 };
        SVECTOR next_inner = { q12(inner * cosine), -explosion->height, q12(-inner * sine), 0 };
        SVECTOR vertices[4] = { previous_outer, next_outer, previous_inner, next_inner };
        if (explosion->material_offset == UINT32_MAX)
            CardDisplayGouraudQuad(
                vertices, colors, ordering, (Tm4CardPacket**)cursor, 1, limit, 200);
        else
            CardDisplayTexturedQuad(vertices, explosion->color, &texture, ordering,
                (Tm4CardPacket**)cursor, 1, limit, 200);
        previous_outer = next_outer;
        previous_inner = next_inner;
    }
    PopMatrix();
}
void Tm3SpawnExplosion(const Tm3ExplosionSettings* settings)
{
    if (settings->owner)
        ObjectCreateWithParticipant(
            explosion_class, 1, settings->source, settings->owner, settings);
    else
        ObjectCreateWithParticipant(explosion_class, 0, settings->source, settings);
}

int Tm3ExplosionsRegister(RegistryDirectory* directory)
{
    return ObjectRegisterClass(explosion_class, sizeof(Tm3Explosion), directory,
        (Tm4PackedConstructor)explosion_constructor, NULL, (Tm4ObjectCallback)explosion_process,
        (Tm4ObjectDisplayCallback)explosion_display, NULL);
}
int Tm3ExplosionInteractionsRegister(void)
{
    return ObjectRegisterInteractionCallback("car", explosion_class, explosion_car);
}
const SnapshotField Tm3ExplosionFields[] = {
    { SnapshotPod, 0, sizeof(Tm3Explosion), NULL },
    { 0 },
};
