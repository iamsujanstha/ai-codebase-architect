import styles from './TableSkeleton.module.css';

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export function TableSkeleton({ rows = 5, columns = 6 }: TableSkeletonProps) {
  return (
    <div className={styles.skeletonContainer}>
      <table className={styles.table}>
        <thead className={styles.tableHeader}>
          <tr>
            {Array.from({ length: columns }).map((_, i) => (
              <th key={i}>
                <div className={styles.skeletonHeader}></div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className={styles.tableBody}>
          {Array.from({ length: rows }).map((_, rowIndex) => (
            <tr key={rowIndex}>
              {Array.from({ length: columns }).map((_, colIndex) => (
                <td key={colIndex}>
                  <div className={styles.skeletonCell}>
                    {colIndex === 0 && (
                      <div className={styles.skeletonAvatar}></div>
                    )}
                    <div className={styles.skeletonText}>
                      <div className={styles.skeletonLine}></div>
                      {colIndex === 0 && (
                        <div className={styles.skeletonLineSmall}></div>
                      )}
                    </div>
                  </div>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
