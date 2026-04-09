namespace IoT.CentralApi.Utilities;

/// <summary>
/// Largest-Triangle-Three-Buckets (LTTB) 降採樣演算法。
/// 保留時序數據的視覺形狀，確保波峰/波谷不會在採樣中遺漏。
/// </summary>
public static class LttbSampler
{
    /// <summary>
    /// 將 <paramref name="data"/> 降採樣至最多 <paramref name="threshold"/> 個點。
    /// </summary>
    /// <param name="data">原始時序資料（需已按時間排序）</param>
    /// <param name="threshold">目標點數（含首尾兩點）</param>
    public static List<(long Time, double Value)> Sample(
        IReadOnlyList<(long Time, double Value)> data,
        int threshold)
    {
        if (threshold <= 0 || data.Count <= threshold)
            return data.ToList();

        var result = new List<(long, double)>(threshold);
        var bucketSize = (double)(data.Count - 2) / (threshold - 2);

        // 第一個點永遠保留
        result.Add(data[0]);

        int selectedIdx = 0;

        for (int i = 0; i < threshold - 2; i++)
        {
            // 計算下一個 bucket 的平均值（用作三角形的第三個頂點）
            var nextBucketStart = (int)Math.Floor((i + 1) * bucketSize) + 1;
            var nextBucketEnd   = (int)Math.Floor((i + 2) * bucketSize) + 1;
            nextBucketEnd = Math.Min(nextBucketEnd, data.Count - 1);

            double avgTime  = 0, avgValue = 0;
            int count = nextBucketEnd - nextBucketStart;
            for (int j = nextBucketStart; j < nextBucketEnd; j++)
            {
                avgTime  += data[j].Time;
                avgValue += data[j].Value;
            }
            if (count > 0) { avgTime /= count; avgValue /= count; }

            // 目前 bucket 的範圍
            var bucketStart = (int)Math.Floor(i * bucketSize) + 1;
            var bucketEnd   = (int)Math.Floor((i + 1) * bucketSize) + 1;
            bucketEnd = Math.Min(bucketEnd, data.Count - 1);

            // 找面積最大的三角形
            var (aTime, aValue) = data[selectedIdx];
            double maxArea = -1;
            int maxIdx = bucketStart;

            for (int j = bucketStart; j < bucketEnd; j++)
            {
                var (bTime, bValue) = data[j];
                double area = Math.Abs(
                    (aTime - avgTime) * (bValue - aValue) -
                    (aTime - bTime)   * (avgValue - aValue)
                ) * 0.5;

                if (area > maxArea) { maxArea = area; maxIdx = j; }
            }

            result.Add(data[maxIdx]);
            selectedIdx = maxIdx;
        }

        // 最後一個點永遠保留
        result.Add(data[^1]);
        return result;
    }
}
