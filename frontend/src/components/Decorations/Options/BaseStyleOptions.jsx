import React from "react";
import { useCakeContext } from "../../../context/CakeContext";

const BaseStyleOptions = () => {
  const { cakeState, dispatch } = useCakeContext();

  const styles = [
    {
      id: "ROUNDED",
      name: "Rounded Cake",
      description: "Classic rounded edges for a soft, elegant look",
      price: 0.0,
    },
    {
      id: "FLAT",
      name: "Flat Cake",
      description: "Modern sharp edges for a contemporary style",
      price: 0.0,
    },
  ];

  const handleSelectStyle = (styleId) => {
    dispatch({ type: "SET_BASE_STYLE", payload: styleId });
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">SELECT BASE STYLE</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {styles.map((style) => (
          <div
            key={style.id}
            className={`cursor-pointer transition-all duration-200 ${
              cakeState.baseStyle === style.id
                ? "border-2 border-pink-500 bg-pink-50"
                : "border border-gray-200 hover:border-pink-300 hover:bg-pink-50"
            } rounded-lg p-6 flex flex-col items-center`}
            onClick={() => handleSelectStyle(style.id)}
          >
            <div className="h-32 w-32 bg-gray-100 rounded-lg flex items-center justify-center mb-4">
              <div
                className={`w-24 h-24 bg-pink-200 ${
                  style.id === "ROUNDED" ? "rounded-full" : "rounded-none"
                }`}
              ></div>
            </div>
            <h3 className="text-lg font-semibold mb-2">{style.name}</h3>
            <p className="text-gray-600 text-center text-sm mb-4">
              {style.description}
            </p>
            <span className="text-pink-600 font-medium">
              Included in base price
            </span>
          </div>
        ))}
      </div>
    </div>
  );
};

export default BaseStyleOptions;
