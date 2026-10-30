/*
 * Zigbee2MQTT external converter for "SanyDIY LD2410C-C6"
 * (ESP32-C6 SuperMini + HLK-LD2410C, custom firmware)
 *
 * Install:
 *   1. copy this file to  <z2m-data>/external_converters/ld2410c_c6.mjs
 *      (Home Assistant add-on:  /config/zigbee2mqtt/external_converters/)
 *   2. restart Zigbee2MQTT
 *
 * Requires Zigbee2MQTT >= 2.0 (ESM external converters).
 *
 * OTA is supported; serving an image needs an OTA index, see the README.
 */

import {Zcl} from 'zigbee-herdsman';
import * as m from 'zigbee-herdsman-converters/lib/modernExtend';
import * as exposes from 'zigbee-herdsman-converters/lib/exposes';

const e = exposes.presets;
const ea = exposes.access;

const CLUSTER = 'ld2410';
const GATES = 9;

/* ------------------------------------------------------------------ *
 * custom cluster definition (must match main/mode_zigbee.h)
 * ------------------------------------------------------------------ */
const ld2410Cluster = {
    name: CLUSTER,
    ID: 0xfc00,
    manufacturerCode: undefined,
    attributes: {
        presence:           {ID: 0x0000, type: Zcl.DataType.BOOLEAN},
        movingTarget:       {ID: 0x0001, type: Zcl.DataType.BOOLEAN},
        stillTarget:        {ID: 0x0002, type: Zcl.DataType.BOOLEAN},
        targetState:        {ID: 0x0003, type: Zcl.DataType.ENUM8},
        movingDistance:     {ID: 0x0004, type: Zcl.DataType.UINT16},
        stillDistance:      {ID: 0x0005, type: Zcl.DataType.UINT16},
        detectionDistance:  {ID: 0x0006, type: Zcl.DataType.UINT16},
        movingEnergy:       {ID: 0x0007, type: Zcl.DataType.UINT8},
        stillEnergy:        {ID: 0x0008, type: Zcl.DataType.UINT8},
        light:              {ID: 0x0009, type: Zcl.DataType.UINT8},
        outPin:             {ID: 0x000a, type: Zcl.DataType.BOOLEAN},

        maxMovingGate:      {ID: 0x0050, type: Zcl.DataType.UINT8},
        maxStillGate:       {ID: 0x0051, type: Zcl.DataType.UINT8},
        noOneDuration:      {ID: 0x0052, type: Zcl.DataType.UINT16},
        distanceResolution: {ID: 0x0053, type: Zcl.DataType.ENUM8},
        engineeringMode:    {ID: 0x0054, type: Zcl.DataType.BOOLEAN},
        bluetooth:          {ID: 0x0055, type: Zcl.DataType.BOOLEAN},
        reportMin:          {ID: 0x0056, type: Zcl.DataType.UINT16},
        reportMax:          {ID: 0x0057, type: Zcl.DataType.UINT16},
        distanceDelta:      {ID: 0x0058, type: Zcl.DataType.UINT8},
        energyDelta:        {ID: 0x0059, type: Zcl.DataType.UINT8},

        sensorOnline:       {ID: 0x0060, type: Zcl.DataType.BOOLEAN},
        radarFwMajor:       {ID: 0x0061, type: Zcl.DataType.UINT8},
        radarFwMinor:       {ID: 0x0062, type: Zcl.DataType.UINT8},
    },
    commands: {
        radarRestart:       {ID: 0x00, parameters: []},
        radarFactoryReset:  {ID: 0x01, parameters: []},
        deviceReboot:       {ID: 0x02, parameters: []},
        deviceFactoryReset: {ID: 0x03, parameters: []},
        enterConfigPortal:  {ID: 0x04, parameters: []},
        setBootMode:        {ID: 0x05, parameters: [{name: 'mode', type: Zcl.DataType.UINT8}]},
        readRadarParams:    {ID: 0x06, parameters: []},
        setConfig:          {ID: 0x07, parameters: [{name: 'attrId', type: Zcl.DataType.UINT16},
                                                    {name: 'value', type: Zcl.DataType.UINT16}]},
    },
    commandsResponse: {},
};

for (let g = 0; g < GATES; g++) {
    ld2410Cluster.attributes[`gate${g}MovingEnergy`] = {ID: 0x0010 + g, type: Zcl.DataType.UINT8};
    ld2410Cluster.attributes[`gate${g}StillEnergy`]  = {ID: 0x0020 + g, type: Zcl.DataType.UINT8};
    ld2410Cluster.attributes[`gate${g}MovingSens`]   = {ID: 0x0030 + g, type: Zcl.DataType.UINT8};
    ld2410Cluster.attributes[`gate${g}StillSens`]    = {ID: 0x0040 + g, type: Zcl.DataType.UINT8};
}

/* zigbee-herdsman hands the definition object back unchanged (getCluster in
 * zspec/zcl/utils.ts), so the object keys are never used as names. Without an
 * explicit name on the cluster, getEndpointsWithCluster() cannot match it and
 * configure fails with "has no input cluster ld2410"; without one on each
 * attribute, incoming reports cannot be mapped back to a field. */
for (const [key, attr] of Object.entries(ld2410Cluster.attributes)) attr.name = key;
for (const [key, cmd] of Object.entries(ld2410Cluster.commands)) cmd.name = key;

/* ------------------------------------------------------------------ *
 * button-like commands
 * ------------------------------------------------------------------ */
const ACTIONS = {
    radar_restart:        'radarRestart',
    radar_factory_reset:  'radarFactoryReset',
    device_reboot:        'deviceReboot',
    device_factory_reset: 'deviceFactoryReset',
    enter_config_portal:  'enterConfigPortal',
    read_radar_params:    'readRadarParams',
};

const tzAction = {
    key: ['action_command'],
    convertSet: async (entity, key, value, meta) => {
        const cmd = ACTIONS[value];
        if (!cmd) throw new Error(`Unknown action '${value}'`);
        await entity.command(CLUSTER, cmd, {}, {disableDefaultResponse: true});
        return {state: {action_command: value}};
    },
};

const tzBootMode = {
    key: ['boot_mode'],
    convertSet: async (entity, key, value, meta) => {
        const map = {zigbee: 1, wifi: 2};
        if (!(value in map)) throw new Error('boot_mode must be zigbee|wifi');
        await entity.command(CLUSTER, 'setBootMode', {mode: map[value]},
            {disableDefaultResponse: true});
        return {state: {boot_mode: value}};
    },
};

const commandsExtend = () => ({
    isModernExtend: true,
    exposes: [
        e.enum('action_command', ea.SET, Object.keys(ACTIONS))
            .withDescription('Maintenance commands')
            .withCategory('config'),
        e.enum('boot_mode', ea.SET, ['zigbee', 'wifi'])
            .withDescription('Switch transport and reboot. WiFi mode leaves the Zigbee network!')
            .withCategory('config'),
    ],
    toZigbee: [tzAction, tzBootMode],
    fromZigbee: [],
});

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

/* Reporting must be configured explicitly. Without it Zigbee2MQTT only reads
 * the attributes once during configure and the values then never change: the
 * firmware reports through esp_zb_zcl_set_attribute_val(), which only emits
 * for attributes a client has subscribed to. min=0 is safe because the
 * firmware rate limits on its own (reportMin/reportMax/distanceDelta/
 * energyDelta in sensor_model.c); max is the heartbeat. */
const REPORT = {min: 0, max: 3600, change: 1};

/* The stack sends reports to whoever is in the binding table, so the
 * coordinator has to be bound for the custom cluster as well. */
const bindExtend = () => ({
    isModernExtend: true,
    configure: [m.setupConfigureForBinding(CLUSTER, 'input')],
});

const ro = (name, attribute, opts = {}) =>
    m.numeric({
        name,
        cluster: CLUSTER,
        attribute,
        access: 'STATE_GET',
        reporting: REPORT,
        description: opts.description,
        unit: opts.unit,
        valueMin: opts.min,
        valueMax: opts.max,
        entityCategory: opts.category,
    });

/* Writing to 0xFC00 is refused by the device's Zigbee stack (NOT_AUTHORIZED,
 * before the firmware is even asked), so configuration goes out as the
 * setConfig command instead. Everything else of the extend stays: the expose
 * keeps its set control, reads still use convertGet, and the firmware reports
 * the value it actually applied. */
const viaSetConfig = (ext, attribute, encode = Number) => ({
    ...ext,
    toZigbee: ext.toZigbee.map((tz) => ({
        ...tz,
        convertSet: async (entity, key, value, meta) => {
            const raw = encode(value);
            if (!Number.isInteger(raw) || raw < 0 || raw > 0xffff) {
                throw new Error(`Invalid value '${value}' for ${key}`);
            }
            await entity.command(CLUSTER, 'setConfig',
                {attrId: ld2410Cluster.attributes[attribute].ID, value: raw},
                {disableDefaultResponse: true});
            return {state: {[key]: value}};
        },
    })),
});

const onOff = (value) => (value === 'ON' || value === true || value === 1 ? 1 : 0);

const rw = (name, attribute, opts = {}) => viaSetConfig(
    m.numeric({
        name,
        cluster: CLUSTER,
        attribute,
        access: 'ALL',
        /* The firmware pushes these back after read_radar_params, so without
         * reporting the UI would keep showing stale values. */
        reporting: REPORT,
        description: opts.description,
        unit: opts.unit,
        valueMin: opts.min,
        valueMax: opts.max,
        valueStep: 1,
        entityCategory: 'config',
    }),
    attribute);

const gateEnergyExtends = [];
for (let g = 0; g < GATES; g++) {
    gateEnergyExtends.push(
        ro(`gate_${g}_moving_energy`, `gate${g}MovingEnergy`,
           {unit: '%', min: 0, max: 100, category: 'diagnostic',
            description: `Moving energy at gate ${g}`}),
        ro(`gate_${g}_still_energy`, `gate${g}StillEnergy`,
           {unit: '%', min: 0, max: 100, category: 'diagnostic',
            description: `Still energy at gate ${g}`}),
    );
}

const gateSensExtends = [];
for (let g = 0; g < GATES; g++) {
    gateSensExtends.push(
        rw(`gate_${g}_moving_sensitivity`, `gate${g}MovingSens`,
           {unit: '%', min: 0, max: 100,
            description: `Moving sensitivity threshold for gate ${g} (lower = more sensitive)`}),
        rw(`gate_${g}_still_sensitivity`, `gate${g}StillSens`,
           {unit: '%', min: 0, max: 100,
            description: `Still sensitivity threshold for gate ${g} (lower = more sensitive)`}),
    );
}

/* ------------------------------------------------------------------ *
 * definition
 * ------------------------------------------------------------------ */
export default {
    zigbeeModel: ['LD2410C-C6'],
    model: 'LD2410C-C6',
    vendor: 'SanyDIY',
    description: 'ESP32-C6 + HLK-LD2410C 24 GHz mmWave presence sensor (custom firmware)',
    /* S/IoT device icon for the Zigbee2MQTT frontend. Inline data URI, so it
     * works offline; source: z2m/siot-icon.svg. A per-device `icon` option in
     * Z2M still overrides it. */
    icon: 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9Ii01NiAtNTggNDIwIDQyMCI+PHJlY3QgeD0iLTU2IiB5PSItNTgiIHdpZHRoPSI0MjAiIGhlaWdodD0iNDIwIiByeD0iOTIiIGZpbGw9IiMwODI5NTciLz48cGF0aCBkPSJNMzEgMjkyVjE0M0g3VjEyOEwxNTMgOEwyMzMgNzMuM1YzNkgyNjVWOTkuNEwzMDAgMTI4VjE0M0gyNzZWMjkyWiIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjRkZGRkZGIiBzdHJva2Utd2lkdGg9IjEyIiBzdHJva2UtbGluZWpvaW49InJvdW5kIi8+PHBhdGggZD0iTTE4Ni44IDEwOC45TDE1NSA5Mkw4OCAxMzNWMTU3TDE1OCAxOTlNMTQ2IDE0OEwyMTggMTkwVjIxMkwxNTAgMjU5TDExNS40IDI0MS43IiBmaWxsPSJub25lIiBzdHJva2U9IiMwOUJGQzUiIHN0cm9rZS13aWR0aD0iMTgiIHN0cm9rZS1saW5lY2FwPSJyb3VuZCIgc3Ryb2tlLWxpbmVqb2luPSJyb3VuZCIvPjxjaXJjbGUgY3g9IjIwNCIgY3k9IjExOCIgcj0iMTMuNSIgZmlsbD0ibm9uZSIgc3Ryb2tlPSIjMDlCRkM1IiBzdHJva2Utd2lkdGg9IjEyIi8+PGNpcmNsZSBjeD0iOTgiIGN5PSIyMzMiIHI9IjEzLjUiIGZpbGw9Im5vbmUiIHN0cm9rZT0iIzA5QkZDNSIgc3Ryb2tlLXdpZHRoPSIxMiIvPjwvc3ZnPg==',
    extend: [
        m.deviceAddCustomCluster(CLUSTER, ld2410Cluster),
        bindExtend(),           /* must follow the cluster registration */
        m.identify(),

        /* --- presence / motion --- */
        m.binary({
            name: 'presence', cluster: CLUSTER, attribute: 'presence',
            valueOn: [true, 1], valueOff: [false, 0], access: 'STATE_GET', reporting: REPORT,
            description: 'Any target detected (moving or still)',
        }),
        m.binary({
            name: 'moving_target', cluster: CLUSTER, attribute: 'movingTarget',
            valueOn: [true, 1], valueOff: [false, 0], access: 'STATE_GET', reporting: REPORT,
            description: 'Moving target detected',
        }),
        m.binary({
            name: 'still_target', cluster: CLUSTER, attribute: 'stillTarget',
            valueOn: [true, 1], valueOff: [false, 0], access: 'STATE_GET', reporting: REPORT,
            description: 'Stationary target detected',
        }),
        m.enumLookup({
            name: 'target_state', cluster: CLUSTER, attribute: 'targetState',
            lookup: {none: 0, moving: 1, still: 2, moving_and_still: 3},
            access: 'STATE_GET', reporting: REPORT, description: 'Radar target state',
        }),
        m.binary({
            name: 'out_pin', cluster: CLUSTER, attribute: 'outPin',
            valueOn: [true, 1], valueOff: [false, 0], access: 'STATE_GET', reporting: REPORT,
            entityCategory: 'diagnostic',
            description: 'Raw OUT pin level reported by the radar',
        }),

        /* --- distances / energies --- */
        ro('moving_distance', 'movingDistance', {unit: 'cm', min: 0, max: 800,
            description: 'Distance of the moving target'}),
        ro('still_distance', 'stillDistance', {unit: 'cm', min: 0, max: 800,
            description: 'Distance of the stationary target'}),
        ro('detection_distance', 'detectionDistance', {unit: 'cm', min: 0, max: 800,
            description: 'Distance reported by the detection algorithm'}),
        ro('moving_energy', 'movingEnergy', {unit: '%', min: 0, max: 100,
            description: 'Signal energy of the moving target'}),
        ro('still_energy', 'stillEnergy', {unit: '%', min: 0, max: 100,
            description: 'Signal energy of the stationary target'}),
        ro('light', 'light', {min: 0, max: 255, category: 'diagnostic',
            description: 'Raw light sensor value (0-255), if the radar reports it'}),

        ...gateEnergyExtends,

        /* --- configuration --- */
        ...gateSensExtends,
        rw('max_moving_gate', 'maxMovingGate', {min: 2, max: 8,
            description: 'Highest gate used for moving detection (gate = 0.75 m or 0.20 m)'}),
        rw('max_still_gate', 'maxStillGate', {min: 2, max: 8,
            description: 'Highest gate used for stationary detection'}),
        rw('no_one_duration', 'noOneDuration', {unit: 's', min: 0, max: 65535,
            description: 'Seconds to keep presence after the last detection'}),
        viaSetConfig(m.enumLookup({
            name: 'distance_resolution', cluster: CLUSTER, attribute: 'distanceResolution',
            lookup: {'0.75m': 0, '0.20m': 1}, access: 'ALL', entityCategory: 'config',
            description: 'Gate size. Changing this restarts the radar.',
        }), 'distanceResolution', (value) => ({'0.75m': 0, '0.20m': 1})[value]),
        viaSetConfig(m.binary({
            name: 'engineering_mode', cluster: CLUSTER, attribute: 'engineeringMode',
            valueOn: ['ON', 1], valueOff: ['OFF', 0], access: 'ALL',
            entityCategory: 'config',
            description: 'Per-gate energy reporting (needed for the gate_* sensors)',
        }), 'engineeringMode', onOff),
        viaSetConfig(m.binary({
            name: 'radar_bluetooth', cluster: CLUSTER, attribute: 'bluetooth',
            valueOn: ['ON', 1], valueOff: ['OFF', 0], access: 'ALL',
            entityCategory: 'config',
            description: 'LD2410C built-in Bluetooth (HLKRadarTool app)',
        }), 'bluetooth', onOff),
        rw('report_min_interval', 'reportMin', {unit: 's', min: 1, max: 3600,
            description: 'Minimum seconds between reports of a changing value'}),
        rw('report_max_interval', 'reportMax', {unit: 's', min: 10, max: 3600,
            description: 'Heartbeat: report at least this often'}),
        rw('distance_report_delta', 'distanceDelta', {unit: 'cm', min: 1, max: 255,
            description: 'Only report a distance when it changed by at least this much'}),
        rw('energy_report_delta', 'energyDelta', {min: 1, max: 100,
            description: 'Only report an energy value when it changed by at least this much'}),

        /* --- diagnostics --- */
        m.binary({
            name: 'radar_online', cluster: CLUSTER, attribute: 'sensorOnline',
            valueOn: [true, 1], valueOff: [false, 0], access: 'STATE_GET', reporting: REPORT,
            entityCategory: 'diagnostic',
            description: 'UART frames are arriving from the LD2410C',
        }),
        ro('radar_fw_major', 'radarFwMajor', {category: 'diagnostic'}),
        ro('radar_fw_minor', 'radarFwMinor', {category: 'diagnostic'}),

        /* --- standard clusters --- */
        m.occupancy(),

        commandsExtend(),
    ],
    /* The firmware carries the OTA Upgrade cluster in client role. Serving the
     * image needs an OTA index pointing at the .ota file produced by the CI;
     * see README for the Zigbee2MQTT setting. */
    ota: true,
    meta: {},
};
