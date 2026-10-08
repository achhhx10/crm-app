declare module 'tw-elements/dist/src/js/data/chart/charts.js' {
  export interface TWEDataset {
    label: string;
    data: number[];
    backgroundColor?: string | string[];
    borderColor?: string | string[];
    borderWidth?: number;
    borderRadius?: number;
    barPercentage?: number;
    categoryPercentage?: number;
  }

  export interface TWEChartConfig {
    type: string;
    data: {
      labels: string[];
      datasets: TWEDataset[];
    };
  }

  export class TWEChart {
    constructor(
      element: HTMLElement,
      data: TWEChartConfig,
      options?: Record<string, unknown>,
      darkOptions?: Record<string, unknown>
    );
    dispose(): void;
    update(data?: Partial<TWEChartConfig>, config?: Record<string, unknown>): void;
    setTheme(theme: string): void;
  }

  export default TWEChart;
}