import * as React from "react"
import { Legend, ResponsiveContainer, Tooltip } from "recharts"
import { cn } from "../../lib/utils"

const ChartContainer = React.forwardRef(({ config, children, className, ...props }, ref) => {
    const chartId = React.useId()

    return (
        <div
            ref={ref}
            className={cn(
                "flex aspect-video justify-center text-xs [&_.recharts-cartesian-axis-tick_text]:fill-muted-foreground [&_.recharts-cartesian-grid_line[stroke='#ccc']]:stroke-border/50 [&_.recharts-curve.recharts-area]:opacity-80 [&_.recharts-dot]:hidden [&_.recharts-grid-line]:stroke-border/50 [&_.recharts-label]:fill-foreground [&_.recharts-rectangle.recharts-tooltip-cursor]:fill-muted [&_.recharts-reference-line_[stroke='#ccc']]:stroke-border [&_.recharts-sector[stroke='#fff']]:stroke-transparent [&_.recharts-vertical-grid-line]:stroke-transparent [&_.recharts-wrap-dots-line]:stroke-transparent",
                className
            )}
            {...props}
        >
            <style
                dangerouslySetInnerHTML={{
                    __html: Object.entries(config)
                        .map(([key, value]) => {
                            const color = value.color
                            if (!color) return null
                            return `
                :root {
                  --color-${key}: ${color};
                }
              `
                        })
                        .filter(Boolean)
                        .join("\n"),
                }}
            />
            <ResponsiveContainer>{children}</ResponsiveContainer>
        </div>
    )
})
ChartContainer.displayName = "ChartContainer"

const ChartTooltip = Tooltip

const ChartTooltipContent = React.forwardRef(
    ({ active, payload, className, indicator = "dot", hideLabel = false, label, labelFormatter, labelClassName }, ref) => {
        if (!active || !payload?.length) {
            return null
        }

        return (
            <div
                ref={ref}
                className={cn(
                    "grid min-w-[10rem] items-start gap-1.5 rounded-2xl border border-zinc-800 bg-black/90 px-4 py-3 text-xs shadow-2xl backdrop-blur-xl",
                    className
                )}
            >
                {!hideLabel && (
                    <div className={cn("font-bold text-zinc-100 mb-1 border-b border-zinc-800 pb-1", labelClassName)}>
                        {labelFormatter ? labelFormatter(label, payload) : label}
                    </div>
                )}
                <div className="grid gap-2">
                    {payload.map((item, index) => {
                        const key = item.dataKey || item.name
                        return (
                            <div key={key} className="flex items-center gap-2">
                                {indicator === "dot" && (
                                    <div
                                        className="h-2 w-2 shrink-0 rounded-full ring-2 ring-blue-500/20"
                                        style={{ backgroundColor: item.color || item.fill }}
                                    />
                                )}
                                <div className="flex flex-1 items-center justify-between leading-none">
                                    <span className="text-zinc-400 font-medium">{item.name || key}</span>
                                    {item.value && (
                                        <span className="font-black tabular-nums text-white ml-4">
                                            {item.value.toLocaleString()}
                                        </span>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        )
    }
)
ChartTooltipContent.displayName = "ChartTooltipContent"

const ChartLegend = Legend

const ChartLegendContent = React.forwardRef(({ payload, className, hideIcon = false }, ref) => {
    if (!payload?.length) {
        return null
    }

    return (
        <div ref={ref} className={cn("flex items-center justify-center gap-4", className)}>
            {payload.map((item) => {
                const key = item.dataKey || item.value
                return (
                    <div key={key} className="flex items-center gap-1.5 [&>svg]:h-3 [&>svg]:w-3 [&>svg]:text-muted-foreground">
                        {!hideIcon && (
                            <div
                                className="h-2 w-2 shrink-0 rounded-[2px]"
                                style={{ backgroundColor: item.color }}
                            />
                        )}
                        {item.value}
                    </div>
                )
            })}
        </div>
    )
})
ChartLegendContent.displayName = "ChartLegendContent"

export {
    ChartContainer,
    ChartTooltip,
    ChartTooltipContent,
    ChartLegend,
    ChartLegendContent,
}
