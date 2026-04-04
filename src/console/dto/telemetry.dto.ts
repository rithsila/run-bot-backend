export class TelemetryAccountDto {
    balance!: number;
    equity!: number;
    margin!: number;
    freeMargin!: number;
    drawdownPct!: number;
    currency!: string;
    dailyPnl!: number;
    dailyLimitHit!: boolean;
}

export class TelemetryPositionSideDto {
    count!: number;
    pnl!: number;
}

export class TelemetryPositionsDto {
    buy!: TelemetryPositionSideDto;
    sell!: TelemetryPositionSideDto;
    totalPnl!: number;
}

export class TelemetryGridDto {
    currentStep!: number;
    stepMode!: number;
    startingLots!: number;
    layerMultiplier!: number;
    basketTpPips!: number;
}

export class TelemetryRiskDto {
    atrPips!: number;
    volatilityRatio!: number;
    spreadPips!: number;
}

export class TelemetrySessionDto {
    active!: boolean;
    sessionCode!: number;
}

export class TelemetrySignalDto {
    enabled!: boolean;
    state!: number;
    stochK!: number;
    stochD!: number;
}

export class TelemetryDto {
    type!: string;
    agentId!: string;
    ts!: number;
    account!: TelemetryAccountDto;
    positions!: TelemetryPositionsDto;
    grid!: TelemetryGridDto;
    risk!: TelemetryRiskDto;
    session!: TelemetrySessionDto;
    signal!: TelemetrySignalDto;
    features!: number;
    statusCode!: number;
}
