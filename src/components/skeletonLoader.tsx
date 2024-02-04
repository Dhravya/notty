import React from 'react';

const SkeletonLoader = () => {
    // Generating some dummy data for the loader
    const dummyData = Array.from({ length: 5 }, (_, index) => ({
        key: `skeleton-${index}`,
    }));

    return (
        <div className="mb-24 flex-1 overflow-auto bg-white p-4 md:mb-10">
            <div className="mx-auto max-w-md">
                <div className="mb-4 font-medium animate-pulse">
                    Your notes
                </div>
                <div className="flex flex-col gap-3">
                    {dummyData.map(({ key }) => (
                        <div className="flex gap-2" key={key}>
                            <div className="w-full rounded-md p-2 bg-gray-200 h-10 animate-pulse">
                                Loading
                            </div>
                            <div className="flex h-10 w-10 items-center justify-center rounded-md p-2 bg-gray-200 animate-pulse"></div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SkeletonLoader;
