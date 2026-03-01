# Asset Pack Evaluation - Another Metroidvania Asset Pack Vol. 1 ver. 1.7

## Tilesets (Backgrounds - 240x160px, tileable)
- `Tilesets/dungeon/bg_00_dungeon.png` - Dark gray stone bricks
- `Tilesets/boss room/bg_00_boss_room.png` - Purple ornate pattern
- `Tilesets/boss room/bg_01_boss_room.png` - Alternative boss room
- `Tilesets/witch shop/bg_00_witch_shop.png` - Dark purple squares
- `Tilesets/library/bg_00_library.png` - Library/study room

## Player Character (16px tall sprite sheets)
- `Player Char/going right animations/char_idle_right_anim.png` - 96x16 = 6 frames
- `Player Char/going right animations/char_run_right_anim.png` - 128x16 = 8 frames
- `Player Char/going right animations/char_attack_00_right_anim.png` - 160x16 = 10 frames
- Mirror left versions in `going left animations/`

## Boss (Lord Wizard - 48px tall)
- `Boss/static-vertical-idle-effect sprites/lord_wizard_idle_anim.png` - 288x48 = 6 frames
- `Boss/static-vertical-idle-effect sprites/lord_wizard_static.png` - 48x48 single
- `Boss/facing right animations/lord_wizard_attack_00_right_anim.png` - 480x48 = 10 frames

## Enemies
- Guardian: `Enemies/Guardian/facing right/guardian_idle_right_anim.png` - 192x16 = 12 frames
- Zombie: `Enemies/Zombie/going right animations/zombie_idle_right_anim.png` - 96x16 = 6 frames
- Others: Bateye, Magician, Painting Ghost, Ratto, Spike Slug, Worm

## NPCs
- `NPCS/shop/witch_merchant_idle.png` - 320x32 = 10 frames (32px tall)

## Props
- Light sources: `Props/light source/light_source_0X_anim.png` - 64x16 = 4 frames each
- Static: ceiling_chain, skulls, table_and_chair, vases, wall_painting, wall_tapestry

## Doors
- `Doors/cross_scene_door_closed.png` - 64x32 (room door)
- `Doors/cross_level_door_closed.png` - 192x32 (level door)
- Animated: opening/closing/locked/unlocked GIFs

## Save Point
- `Save Point/goddess_bench_static.png` - 32x32
- `Save Point/goddess_bench_saving_effect.png` - animated

## Effects
- dust_from_run, explosion_effect_big/small, hit_effect, flying_orb, portal_void

## Design Plan

### Room Layout (connected with corridors):
```
[LIBRARY/SANCTUARY] --door-- [DUNGEON CORRIDOR] --door-- [BOSS ARENA]
                                      |
                              [MERCHANT SHOP]
                                      |
                              [TAVERN/RESTING]
```

### Room Backgrounds:
- LIBRARY/SANCTUARY → library/bg_00_library.png
- DUNGEON CORRIDOR → dungeon/bg_00_dungeon.png
- BOSS ARENA → boss room/bg_00_boss_room.png
- MERCHANT SHOP → witch shop/bg_00_witch_shop.png
- TAVERN → dungeon bg (darker tint)

### Hero State → Animation:
- idle → char_idle_right_anim (6 frames, 16px)
- typing/working → char_run_right_anim (8 frames)
- thinking → char_idle slower fps
- fighting → char_attack_00_right_anim (10 frames)
- resting → char_idle at tavern

### Boss in Boss Arena:
- lord_wizard_idle_anim (6 frames, 48px) - always present
- When hero fighting: lord_wizard_attack_00_right_anim

### Enemies in Dungeon:
- guardian_idle in dungeon corridor
- zombie near tavern

### Corridors:
- Narrow dungeon-bg strip connecting rooms
- cross_scene_door at room entrances

### Scale:
- Hero sprites: 16px → render at 3x = 48px
- Boss: 48px → render at 2x = 96px
- Background: 240x160 → tile to fill room
