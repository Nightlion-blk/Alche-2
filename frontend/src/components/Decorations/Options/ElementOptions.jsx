import React from "react";
import { useCakeContext } from "../../../context/CakeContext";

const ElementOptions = () => {
  const { cakeState, dispatch } = useCakeContext();

  const categories = [
    { id: "sprinkles", name: "Sprinkles" },
    { id: "flowers", name: "Flowers" },
    { id: "fruits", name: "Fruits" },
    { id: "candies", name: "Candies" },
  ];

  const [activeCategory, setActiveCategory] = React.useState("sprinkles");

  const elements = {
    sprinkles: [
      { id: "rainbow-sprinkles", name: "Rainbow Sprinkles", price: 2.0 },
      { id: "chocolate-sprinkles", name: "Chocolate Sprinkles", price: 2.0 },
      { id: "sugar-pearls", name: "Sugar Pearls", price: 3.0 },
      { id: "confetti", name: "Confetti", price: 2.5 },
    ],
    flowers: [
      { id: "rose-buds", name: "Rose Buds", price: 4.0 },
      { id: "lavender", name: "Lavender", price: 3.5 },
      { id: "sunflower", name: "Sunflower", price: 4.0 },
      { id: "orchid", name: "Orchid", price: 5.0 },
    ],
    fruits: [
      { id: "strawberry-slices", name: "Strawberry Slices", price: 3.0 },
      { id: "blueberries", name: "Blueberries", price: 3.5 },
      { id: "kiwi-slices", name: "Kiwi Slices", price: 3.5 },
      { id: "raspberry", name: "Raspberry", price: 4.0 },
    ],
    candies: [
      { id: "chocolate-chips", name: "Chocolate Chips", price: 2.5 },
      { id: "mini-marshmallows", name: "Mini Marshmallows", price: 2.5 },
      { id: "candy-buttons", name: "Candy Buttons", price: 3.0 },
      { id: "jelly-beans", name: "Jelly Beans", price: 3.0 },
    ],
  };

  const handleAddElement = (elementId) => {
    dispatch({ type: "ADD_ELEMENT", payload: elementId });
  };

  const handleRemoveElement = (elementId) => {
    dispatch({ type: "REMOVE_ELEMENT", payload: elementId });
  };

  const isElementSelected = (elementId) => {
    return cakeState.elements.includes(elementId);
  };

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">4. ELEMENTS</h2>

      <div className="flex flex-wrap border-b border-gray-200 mb-4">
        {categories.map((category) => (
          <button
            key={category.id}
            className={`px-4 py-2 font-medium text-sm transition-colors ${
              activeCategory === category.id
                ? "border-b-2 border-pink-500 text-pink-600"
                : "text-gray-600 hover:text-pink-500"
            }`}
            onClick={() => setActiveCategory(category.id)}
          >
            {category.name}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {elements[activeCategory].map((element) => (
          <div
            key={element.id}
            className={`cursor-pointer transition-all duration-200 ${
              isElementSelected(element.id)
                ? "border-2 border-pink-500 bg-pink-50"
                : "border border-gray-200 hover:border-pink-300 hover:bg-pink-50"
            } rounded-lg p-4 flex flex-col items-center`}
            onClick={() =>
              isElementSelected(element.id)
                ? handleRemoveElement(element.id)
                : handleAddElement(element.id)
            }
          >
            <div className="h-16 w-16 bg-gray-100 rounded-lg flex items-center justify-center mb-2">
              <div className="w-12 h-12 bg-gray-300 rounded"></div>
            </div>
            <span className="font-medium text-sm text-center">
              {element.name}
            </span>
            <span className="text-gray-600 text-sm">
              ₱ {element.price.toFixed(2)}
            </span>
          </div>
        ))}
      </div>

      {cakeState.elements.length > 0 && (
        <div className="mt-6 p-4 bg-gray-50 rounded-lg">
          <h3 className="font-medium text-lg mb-2">Selected Elements</h3>
          <div className="flex flex-wrap gap-2">
            {cakeState.elements.map((elementId) => {
              const element = Object.values(elements)
                .flat()
                .find((e) => e.id === elementId);

              return element ? (
                <div
                  key={elementId}
                  className="bg-white px-3 py-1 rounded-full text-sm flex items-center"
                >
                  <span>{element.name}</span>
                  <button
                    className="ml-2 text-gray-400 hover:text-pink-600"
                    onClick={() => handleRemoveElement(elementId)}
                  >
                    ×
                  </button>
                </div>
              ) : null;
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default ElementOptions;
