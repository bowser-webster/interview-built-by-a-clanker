import { Link } from "@tanstack/react-router";
import type { CartItem as CartItemType } from "@acme/shared";

interface CartItemProps {
  item: CartItemType;
  onUpdateQuantity: (quantity: number) => void;
  onRemove: () => void;
}

export function CartItem({ item, onUpdateQuantity, onRemove }: CartItemProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center gap-4">
      <Link
        to="/personas/$personaId"
        params={{ personaId: item.personaId }}
        className="flex-shrink-0"
      >
        <img
          src={item.persona.avatarUrl}
          alt={item.persona.name}
          className="w-16 h-16 rounded-xl bg-gray-100"
        />
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          to="/personas/$personaId"
          params={{ personaId: item.personaId }}
          className="font-semibold text-gray-900 hover:text-indigo-600 transition-colors"
        >
          {item.persona.name}
        </Link>
        <p className="text-sm text-gray-500">{item.persona.tagline}</p>
        <p className="text-sm font-medium text-gray-700 mt-1">
          ${item.persona.price.toFixed(2)}/mo
        </p>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => onUpdateQuantity(item.quantity - 1)}
          disabled={item.quantity <= 1}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          -
        </button>
        <span className="w-8 text-center font-medium text-gray-900">
          {item.quantity}
        </span>
        <button
          onClick={() => onUpdateQuantity(item.quantity + 1)}
          className="w-8 h-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors"
        >
          +
        </button>
      </div>

      <div className="text-right ml-4">
        <p className="font-semibold text-gray-900">
          ${(item.persona.price * item.quantity).toFixed(2)}
        </p>
        <button
          onClick={onRemove}
          className="text-sm text-red-500 hover:text-red-700 transition-colors mt-1"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
