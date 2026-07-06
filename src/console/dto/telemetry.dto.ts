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

export class TelemetryClosedTradeDto {
    closeTime!: number; // unix seconds (broker server time)
    side!: 'buy' | 'sell';
    lots!: number;
    pnl!: number; // profit + swap + commission, account currency
    durationSec!: number;
    reason!: string; // EA close comment: BasketTP, EquityProtection, OutsideSession, KillSwitch, ...
}

export class TelemetryDto {
    type!: string;
    agentId!: string;
    ts!: number;
    account!: TelemetryAccountDto;
    positions!: TelemetryPositionsDto;
    grid!: TelemetryGridDto;
    statusCode!: number;
    openPositions?: TelemetryClosedTradeDto[];
    history?: TelemetryClosedTradeDto[];
}
