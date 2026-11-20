#include "car_status_effects.h"
#include "decoration.h"
#include "destruction.h"
#include "flash.h"
#include "private.h"
#include "prop.h"
#include "remote.h"
#include "stage.h"
#include "surface.h"
#include "tm3/lightning.h"
#include "tm3/missile.h"
#include "tm3/resources.h"
#include "tm3/world.h"
#include "tm4/main/os.h"
#include "tm4/modules/powerup.h"
#include "world_contact.h"
#include "world_weapons.h"
#include <string.h>
#include <strings.h>

s32 InteractCarWithPowerupTm3(Car*, PowerupState*);
#ifdef TM3_TEST_HOOKS
s32 Tm3TestPickupState(void);
#endif
extern const WebWorldWeapons Tm3WorldWeapons;
extern const WebCarStatusEffects Tm3StatusEffects;

#define EXPORT(symbol)                                                                             \
    if (!strcasecmp(name, #symbol))                                                                \
    return (OSWord) & symbol
__attribute__((visibility("default"))) OSWord Tm4ModuleExport(const char* name)
{
    if (!strcmp(name, "__rm4_snapshot_types"))
        return (OSWord)Tm3SnapshotTypes();
    EXPORT(InteractCarWithPowerupTm3);
    EXPORT(Tm3LaunchWorldProjectile);
    EXPORT(Tm3LaunchLightning);
    EXPORT(Tm3PlaceRemote);
    if (!strcmp(name, "Tm3WorldWeapons"))
        return (OSWord)&Tm3WorldWeapons;
    if (!strcmp(name, "Tm3StatusEffects"))
        return (OSWord)&Tm3StatusEffects;
    EXPORT(Tm3ContactEffects);
    EXPORT(Tm3TeleportEffect);
    EXPORT(Tm3DamageScenery);
    EXPORT(Tm3DestroyableSizeof);
    EXPORT(Tm3DestroyableInstanceConstructor);
    EXPORT(Tm3DestroyableProcess);
    EXPORT(Tm3DestroyableDestructor);
    EXPORT(InteractBulletWithTm3Destroyable);
    EXPORT(InteractWeaponProjectileWithTm3Destroyable);
    EXPORT(InteractCarWithTm3Destroyable);
    EXPORT(InteractExplosionShockWaveWithTm3Destroyable);
    EXPORT(InteractWeaponRayBeamWithTm3Destroyable);
#ifdef TM3_TEST_HOOKS
    EXPORT(Tm3TestHitSceneryWithEvent);
    EXPORT(Tm3TestPickupState);
#endif
    EXPORT(Tm3ScreenEffect);
    EXPORT(Tm3FragmentImpact);
    EXPORT(Tm3TransitionSizeof);
    EXPORT(Tm3TransitionInstanceConstructor);
    EXPORT(Tm3TransitionProcess);
    EXPORT(Tm3TransitionDisplay);
    EXPORT(Tm3PropSizeof);
    EXPORT(Tm3PropInstanceConstructor);
    EXPORT(Tm3PropProcess);
    EXPORT(Tm3PropDisplay);
    EXPORT(InteractBulletWithTm3Prop);
    EXPORT(Tm3DecorationSizeof);
    EXPORT(Tm3DecorationInstanceConstructor);
    EXPORT(Tm3DecorationDisplay);
    EXPORT(Tm3ResourcesAcquire);
    EXPORT(Tm3MissileLaunch);
    EXPORT(Tm3WeaponAnimationTexture);
    EXPORT(Tm3BodyForwardStep);
    EXPORT(Tm3SpawnLightning);
    EXPORT(Tm3MarkerLightning);
    EXPORT(Tm3WorldMarker);
    EXPORT(Tm3LaunchMapBeam);
    EXPORT(Tm3PropSpin);
    EXPORT(Tm3WorldProjectile);
    EXPORT(Tm3ProjectileType_Fire);
    EXPORT(Tm3ProjectileType_Homing);
    EXPORT(Tm3ProjectileType_Power);
    EXPORT(Tm3ProjectileType_Freeze);
    EXPORT(Tm3ProjectileType_Napalm);
    EXPORT(Tm3ProjectileType_Ricochet);
    EXPORT(Tm3ProjectileType_Speed);
    EXPORT(Tm3ProjectileType_Rain);
    EXPORT(Tm3ProjectileType_Mortar);

    EXPORT(Tm3StartFlamer);
    EXPORT(Tm3ResourcesRelease);
    EXPORT(Tm3LoadSound);
    EXPORT(Tm3PlayNamedSound);
    EXPORT(Tm3SpawnSprite);
    EXPORT(Tm3CarTurboProcess);
    EXPORT(Tm3CarEngineProcess);
    EXPORT(Tm3BodyAnimate);
    EXPORT(Tm3BodyGroupPose);
    EXPORT(Tm3ProjectileNormalize);
    EXPORT(Tm3ProjectileAdvance);
    EXPORT(Tm3ProjectileGuide);
    EXPORT(Tm3ProjectileImpactForce);
    EXPORT(Tm3ProjectileOrient);
    EXPORT(Tm3ProjectileModelPose);
    EXPORT(Tm3ProjectileLaunchFrame);
    EXPORT(Tm3ProjectileLaunchVelocity);
    EXPORT(Tm3MissileTrailInit);
    EXPORT(Tm3MissileTrailStep);
    EXPORT(Tm3DisplayMissileTrail);
    EXPORT(Tm3WeaponTimeTicks);
    EXPORT(Tm3SpawnExplosion);
    EXPORT(Tm3DisplayCarGroups);
    EXPORT(Tm3DisplayWeaponGroup);
    EXPORT(Tm3DrawOutlawEmitter);
    EXPORT(Tm3DrawOutlawBolt);
    EXPORT(Tm3SpriteFrameCount);
    EXPORT(Tm3SpawnBurstParticles);
    return 0;
}
